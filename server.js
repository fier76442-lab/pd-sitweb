require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

// ==================================================
// ENV
// ==================================================

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const GUILD_ID = process.env.DISCORD_GUILD_ID;

const APPLICATION_CHANNEL_ID =
    process.env.APPLICATION_CHANNEL_ID;

const RESULTS_CHANNEL_ID =
    process.env.RESULTS_CHANNEL_ID;

const SESSION_SECRET =
    process.env.SESSION_SECRET;

const REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    `http://localhost:${PORT}/auth/discord/callback`;

const IS_PRODUCTION =
    process.env.NODE_ENV === "production" ||
    !!process.env.RENDER;

// ==================================================
// CONFIG CHECK
// ==================================================

console.log("=================================");
console.log("🚔 PD APPLICATION");
console.log("=================================");

console.log(
    "CLIENT_ID:",
    CLIENT_ID ? "OK" : "MISSING"
);

console.log(
    "CLIENT_SECRET:",
    CLIENT_SECRET ? "OK" : "MISSING"
);

console.log(
    "BOT_TOKEN:",
    BOT_TOKEN ? "OK" : "MISSING"
);

console.log(
    "GUILD_ID:",
    GUILD_ID ? "OK" : "MISSING"
);

console.log(
    "APPLICATION_CHANNEL_ID:",
    APPLICATION_CHANNEL_ID ? "OK" : "MISSING"
);

console.log(
    "RESULTS_CHANNEL_ID:",
    RESULTS_CHANNEL_ID ? "OK" : "MISSING"
);

console.log(
    "SESSION_SECRET:",
    SESSION_SECRET ? "OK" : "MISSING"
);

console.log(
    "REDIRECT_URI:",
    REDIRECT_URI
);

console.log(
    "PRODUCTION:",
    IS_PRODUCTION ? "YES" : "NO"
);

console.log("=================================");

if (!SESSION_SECRET) {
    console.error(
        "❌ SESSION_SECRET is missing from environment variables."
    );
}

// ==================================================
// EXPRESS
// ==================================================

app.set("trust proxy", 1);

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

// ==================================================
// STATIC WEBSITE
// ==================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ==================================================
// COOKIE HELPERS
// ==================================================

function parseCookies(req) {
    const header = req.headers.cookie;

    if (!header) {
        return {};
    }

    const cookies = {};

    header.split(";").forEach((part) => {
        const index = part.indexOf("=");

        if (index === -1) {
            return;
        }

        const key = part
            .slice(0, index)
            .trim();

        const value = part
            .slice(index + 1)
            .trim();

        try {
            cookies[key] =
                decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    });

    return cookies;
}

// ==================================================
// BASE64 URL
// ==================================================

function base64urlEncode(value) {
    return Buffer
        .from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function base64urlDecode(value) {
    let data = String(value)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (data.length % 4) {
        data += "=";
    }

    return Buffer
        .from(data, "base64")
        .toString("utf8");
}

// ==================================================
// SIGNED VALUES
// ==================================================

function createSignature(data) {
    return crypto
        .createHmac(
            "sha256",
            SESSION_SECRET || "temporary-secret"
        )
        .update(data)
        .digest("base64url");
}

function createSignedValue(data) {
    const encoded =
        base64urlEncode(
            JSON.stringify(data)
        );

    const signature =
        createSignature(encoded);

    return `${encoded}.${signature}`;
}

function verifySignedValue(value) {
    if (!value) {
        return null;
    }

    const parts =
        String(value).split(".");

    if (parts.length !== 2) {
        return null;
    }

    const encoded = parts[0];
    const signature = parts[1];

    const expected =
        createSignature(encoded);

    try {
        const signatureBuffer =
            Buffer.from(signature);

        const expectedBuffer =
            Buffer.from(expected);

        if (
            signatureBuffer.length !==
            expectedBuffer.length
        ) {
            return null;
        }

        if (
            !crypto.timingSafeEqual(
                signatureBuffer,
                expectedBuffer
            )
        ) {
            return null;
        }
    } catch {
        return null;
    }

    try {
        return JSON.parse(
            base64urlDecode(encoded)
        );
    } catch {
        return null;
    }
}

// ==================================================
// SET COOKIE
// ==================================================

function setCookie(
    res,
    name,
    value,
    maxAge,
    sameSite = "Lax"
) {
    let cookie =
        `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}`;

    if (maxAge !== undefined) {
        cookie +=
            `; Max-Age=${Math.floor(maxAge / 1000)}`;
    }

    if (IS_PRODUCTION) {
        cookie += "; Secure";
    }

    const existing =
        res.getHeader("Set-Cookie");

    const cookies = existing
        ? Array.isArray(existing)
            ? [...existing]
            : [existing]
        : [];

    cookies.push(cookie);

    res.setHeader(
        "Set-Cookie",
        cookies
    );
}

// ==================================================
// CLEAR COOKIE
// ==================================================

function clearCookie(res, name) {
    setCookie(
        res,
        name,
        "",
        0
    );
}

// ==================================================
// GET LOGGED USER
// ==================================================

function getLoggedUser(req) {
    const cookies =
        parseCookies(req);

    const sessionCookie =
        cookies.pd_session;

    if (!sessionCookie) {
        return null;
    }

    const session =
        verifySignedValue(
            sessionCookie
        );

    if (!session) {
        return null;
    }

    if (
        !session.user ||
        !session.created
    ) {
        return null;
    }

    const maxAge =
        1000 * 60 * 60 * 24;

    if (
        Date.now() -
        session.created >
        maxAge
    ) {
        return null;
    }

    return session.user;
}

// ==================================================
// SAVE LOGGED USER
// ==================================================

function saveLoggedUser(res, user) {
    const sessionData = {
        user: {
            id: user.id,

            username:
                user.username,

            global_name:
                user.global_name ||
                user.username,

            avatar:
                user.avatar || null
        },

        created: Date.now()
    };

    const value =
        createSignedValue(
            sessionData
        );

    setCookie(
        res,
        "pd_session",
        value,
        1000 * 60 * 60 * 24
    );
}

// ==================================================
// DISCORD BOT
// ==================================================

const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ==================================================
// DISCORD LOGIN
// ==================================================

app.get(
    "/auth/discord",
    (req, res) => {
        try {
            if (!CLIENT_ID) {
                return res
                    .status(500)
                    .send(
                        "DISCORD_CLIENT_ID is missing."
                    );
            }

            if (!CLIENT_SECRET) {
                return res
                    .status(500)
                    .send(
                        "DISCORD_CLIENT_SECRET is missing."
                    );
            }

            if (!SESSION_SECRET) {
                return res
                    .status(500)
                    .send(
                        "SESSION_SECRET is missing."
                    );
            }

            const state =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            const join =
                req.query.join === "1";

            const stateData = {
                state,
                join,
                created: Date.now()
            };

            const stateCookie =
                createSignedValue(
                    stateData
                );

            // OAuth state cookie
            // SameSite=None is important for OAuth callback
            setCookie(
                res,
                "pd_oauth_state",
                stateCookie,
                10 * 60 * 1000,
                "None"
            );

            const params =
                new URLSearchParams();

            params.set(
                "client_id",
                CLIENT_ID
            );

            params.set(
                "response_type",
                "code"
            );

            params.set(
                "redirect_uri",
                REDIRECT_URI
            );

            params.set(
                "scope",
                join
                    ? "identify guilds.join"
                    : "identify"
            );

            params.set(
                "state",
                state
            );

            const discordUrl =
                "https://discord.com/oauth2/authorize?" +
                params.toString();

            console.log(
                "================================="
            );

            console.log(
                "🔐 DISCORD LOGIN START"
            );

            console.log(
                "REDIRECT:",
                REDIRECT_URI
            );

            console.log(
                "STATE COOKIE: CREATED"
            );

            console.log(
                "================================="
            );

            return res.redirect(
                discordUrl
            );

        } catch (error) {
            console.error(
                "OAuth start error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Unable to start Discord login."
                );
        }
    }
);

// ==================================================
// DISCORD OAUTH CALLBACK
// ==================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {
        try {
            console.log(
                "================================="
            );

            console.log(
                "🔄 DISCORD CALLBACK"
            );

            console.log(
                "Query:",
                {
                    code: req.query.code
                        ? "PRESENT"
                        : "MISSING",

                    state: req.query.state
                        ? "PRESENT"
                        : "MISSING"
                }
            );

            const code =
                req.query.code;

            const state =
                req.query.state;

            const oauthError =
                req.query.error;

            // ------------------------------------------
            // DISCORD ERROR
            // ------------------------------------------

            if (oauthError) {
                console.error(
                    "Discord OAuth error:",
                    oauthError
                );

                clearCookie(
                    res,
                    "pd_oauth_state"
                );

                return res
                    .status(400)
                    .send(
                        "Discord authentication was cancelled."
                    );
            }

            if (!code || !state) {
                return res
                    .status(400)
                    .send(
                        "Invalid OAuth request."
                    );
            }

            // ------------------------------------------
            // READ STATE COOKIE
            // ------------------------------------------

            const cookies =
                parseCookies(req);

            const rawStateCookie =
                cookies.pd_oauth_state;

            console.log(
                "STATE COOKIE:",
                rawStateCookie
                    ? "RECEIVED"
                    : "MISSING"
            );

            if (!rawStateCookie) {
                return res
                    .status(400)
                    .send(
                        "OAuth state cookie was not received. Please try Login with Discord again."
                    );
            }

            const savedState =
                verifySignedValue(
                    rawStateCookie
                );

            if (!savedState) {
                console.error(
                    "❌ OAuth state signature invalid."
                );

                return res
                    .status(400)
                    .send(
                        "Invalid or expired OAuth state."
                    );
            }

            if (
                savedState.state !==
                state
            ) {
                console.error(
                    "❌ OAuth state mismatch."
                );

                return res
                    .status(400)
                    .send(
                        "Invalid OAuth state."
                    );
            }

            if (
                !savedState.created ||
                Date.now() -
                savedState.created >
                10 * 60 * 1000
            ) {
                clearCookie(
                    res,
                    "pd_oauth_state"
                );

                return res
                    .status(400)
                    .send(
                        "OAuth state expired."
                    );
            }

            clearCookie(
                res,
                "pd_oauth_state"
            );

            // ------------------------------------------
            // EXCHANGE CODE
            // ------------------------------------------

            const tokenParams =
                new URLSearchParams();

            tokenParams.set(
                "client_id",
                CLIENT_ID
            );

            tokenParams.set(
                "client_secret",
                CLIENT_SECRET
            );

            tokenParams.set(
                "grant_type",
                "authorization_code"
            );

            tokenParams.set(
                "code",
                code
            );

            tokenParams.set(
                "redirect_uri",
                REDIRECT_URI
            );

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/oauth2/token",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body:
                            tokenParams.toString()
                    }
                );

            const tokenText =
                await tokenResponse.text();

            let tokenData;

            try {
                tokenData =
                    JSON.parse(
                        tokenText
                    );
            } catch {
                tokenData = {
                    raw: tokenText
                };
            }

            console.log(
                "TOKEN RESPONSE:",
                tokenResponse.status
            );

            if (
                !tokenResponse.ok ||
                !tokenData.access_token
            ) {
                console.error(
                    "OAuth token error:",
                    tokenData
                );

                return res
                    .status(400)
                    .send(
                        "Discord OAuth failed."
                    );
            }

            // ------------------------------------------
            // GET DISCORD USER
            // ------------------------------------------

            const userResponse =
                await fetch(
                    "https://discord.com/api/users/@me",
                    {
                        headers: {
                            Authorization:
                                "Bearer " +
                                tokenData.access_token
                        }
                    }
                );

            const user =
                await userResponse.json();

            if (
                !userResponse.ok ||
                !user.id
            ) {
                console.error(
                    "Discord user error:",
                    user
                );

                return res
                    .status(400)
                    .send(
                        "Unable to get Discord user."
                    );
            }

            // ------------------------------------------
            // SAVE SESSION
            // ------------------------------------------

            saveLoggedUser(
                res,
                user
            );

            console.log(
                "✅ DISCORD LOGIN SUCCESS"
            );

            console.log(
                "User:",
                user.global_name ||
                user.username
            );

            console.log(
                "ID:",
                user.id
            );

            console.log(
                "SESSION COOKIE: CREATED"
            );

            // ------------------------------------------
            // OPTIONAL SERVER JOIN
            // ------------------------------------------

            if (
                savedState.join &&
                tokenData.scope &&
                tokenData.scope.includes(
                    "guilds.join"
                )
            ) {
                if (
                    GUILD_ID &&
                    BOT_TOKEN
                ) {
                    try {
                        const joinResponse =
                            await fetch(
                                `https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`,
                                {
                                    method: "PUT",

                                    headers: {
                                        Authorization:
                                            "Bot " +
                                            BOT_TOKEN,

                                        "Content-Type":
                                            "application/json"
                                    },

                                    body:
                                        JSON.stringify({
                                            access_token:
                                                tokenData.access_token
                                        })
                                }
                            );

                        if (
                            !joinResponse.ok
                        ) {
                            const errorText =
                                await joinResponse.text();

                            console.error(
                                "Guild join error:",
                                joinResponse.status,
                                errorText
                            );
                        } else {
                            console.log(
                                "✅ User joined Discord server."
                            );
                        }

                    } catch (joinError) {
                        console.error(
                            "Guild join error:",
                            joinError
                        );
                    }
                }
            }

            console.log(
                "================================="
            );

            return res.redirect("/");

        } catch (error) {
            console.error(
                "❌ OAuth callback error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Something went wrong with Discord authentication."
                );
        }
    }
);

// ==================================================
// CURRENT USER
// ==================================================

app.get(
    "/api/me",
    (req, res) => {
        const user =
            getLoggedUser(req);

        console.log(
            "📡 /api/me:",
            user
                ? `LOGGED IN - ${user.username}`
                : "NOT LOGGED IN"
        );

        if (!user) {
            return res.json({
                loggedIn: false
            });
        }

        return res.json({
            loggedIn: true,

            user: {
                id: user.id,

                username:
                    user.username,

                global_name:
                    user.global_name ||
                    user.username,

                avatar:
                    user.avatar || null
            }
        });
    }
);

// ==================================================
// LOGOUT
// ==================================================

app.get(
    "/logout",
    (req, res) => {
        clearCookie(
            res,
            "pd_session"
        );

        return res.redirect("/");
    }
);

// ==================================================
// PD QUESTIONS
// ==================================================

const questions = [
    "9adech 3omrek fi denya?",

    "Chnowa ta3ref 3al PD?",

    "9adech men se3a tel3eb fi nhar?",

    "Chnowa bch tfidna enti fel PD?",

    "3lech 5tart el PD men kol el factions w gangs?",

    "3andek 5ebra 9bal fel PD?",

    "Chnowa esmek In-Game?",

    "Chnowa level mte3ek In-Game?",

    "Ken t3areket enti w zamilik, chnowa bch ta3mel?",

    "9adech men 3am wala chhar 3andek tel3eb SA-MP?",

    "3lech theb tod5el lel PD?",

    "Ba3ed barcha 5edma fel PD, chnowa bch ta3mel?",

    "Ken wehed jek yheb ya3mel m3ak fight, chnowa bch ta3mel?",

    "Ken jbetlo Tazer bech tazih, chnowa bch ta3mel?",

    "Chnowa ma3neha RP?",

    "Chnowa ma3neha Mass RP?",

    "Chnowa ma3neha Force RP?",

    "Chnowa ma3neha Team Kill?",

    "Chnowa ma3neha Power Gaming (PG)?",

    "Chnowa ma3neha Zero Value Of Life (ZVL)?",

    "Chnowa ma3neha Vehicle Deathmatching (RVDM)?",

    "Chnowa ma3neha Revenge Kill (RK)?",

    "Chnowa ma3neha Combat Storing (CS)?",

    "Chnowa ma3neha Logging To Avoid (LTA)?"
];

// ==================================================
// SUBMIT APPLICATION
// ==================================================

app.post(
    "/api/application",
    async (req, res) => {
        try {
            // ------------------------------------------
            // CHECK LOGIN
            // ------------------------------------------

            const user =
                getLoggedUser(req);

            if (!user) {
                return res
                    .status(401)
                    .json({
                        success: false,

                        message:
                            "Lezem ta3mel Login with Discord."
                    });
            }

            // ------------------------------------------
            // GET ANSWERS
            // ------------------------------------------

            const answers =
                req.body.answers ||
                req.body;

            // ------------------------------------------
            // CHECK ALL QUESTIONS
            // ------------------------------------------

            for (
                let i = 1;
                i <= questions.length;
                i++
            ) {
                const answer =
                    answers["q" + i];

                if (
                    !answer ||
                    String(answer).trim() === ""
                ) {
                    return res
                        .status(400)
                        .json({
                            success: false,

                            message:
                                "Lezem tjaweb 3la sou2el " +
                                i +
                                "."
                        });
                }
            }

            // ------------------------------------------
            // CHECK BOT
            // ------------------------------------------

            if (!bot.isReady()) {
                return res
                    .status(503)
                    .json({
                        success: false,

                        message:
                            "Discord bot is not ready."
                    });
            }

            // ------------------------------------------
            // GET APPLICATION CHANNEL
            // ------------------------------------------

            const channel =
                await bot.channels.fetch(
                    APPLICATION_CHANNEL_ID
                );

            if (!channel) {
                throw new Error(
                    "Application channel not found."
                );
            }

            if (!channel.isTextBased()) {
                throw new Error(
                    "Application channel is not a text channel."
                );
            }

            // ------------------------------------------
            // APPLICATION EMBED
            // ------------------------------------------

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🚔 PD APPLICATION"
                    )

                    .setDescription(
                        "📋 Nouvelle demande PD\n\n" +

                        "👤 Applicant: **" +
                        (
                            user.global_name ||
                            user.username
                        ) +
                        "**\n\n" +

                        "🆔 Discord ID: **" +
                        user.id +
                        "**"
                    )

                    .setColor(0x1769aa)

                    .setTimestamp();

            // ------------------------------------------
            // AVATAR
            // ------------------------------------------

            if (user.avatar) {
                embed.setThumbnail(
                    `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                );
            }

            // ------------------------------------------
            // QUESTIONS + ANSWERS
            // ------------------------------------------

            questions.forEach(
                (question, index) => {
                    const answer =
                        String(
                            answers[
                                "q" +
                                (index + 1)
                            ]
                        )
                            .trim()
                            .slice(0, 1024);

                    embed.addFields({
                        name:
                            (index + 1) +
                            ". " +
                            question,

                        value:
                            answer ||
                            "Aucune réponse"
                    });
                }
            );

            // ------------------------------------------
            // UNIQUE APPLICATION ID
            // ------------------------------------------

            const applicationId =
                crypto
                    .randomBytes(8)
                    .toString("hex");

            // ------------------------------------------
            // ACCEPT / REFUSE BUTTONS
            // ------------------------------------------

            const buttons =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `pd_accept:${user.id}:${applicationId}`
                            )

                            .setLabel(
                                "ACCEPT"
                            )

                            .setEmoji(
                                "✅"
                            )

                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `pd_refuse:${user.id}:${applicationId}`
                            )

                            .setLabel(
                                "REFUSE"
                            )

                            .setEmoji(
                                "❌"
                            )

                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            // ------------------------------------------
            // SEND APPLICATION
            // ------------------------------------------

            await channel.send({
                embeds: [embed],

                components: [
                    buttons
                ]
            });

            console.log(
                "================================="
            );

            console.log(
                "✅ APPLICATION SUBMITTED"
            );

            console.log(
                "Applicant:",
                user.username
            );

            console.log(
                "Discord ID:",
                user.id
            );

            console.log(
                "Application ID:",
                applicationId
            );

            console.log(
                "================================="
            );

            return res.json({
                success: true,

                message:
                    "Application sent successfully."
            });

        } catch (error) {
            console.error(
                "❌ Application error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        error.message ||
                        "Application failed."
                });
        }
    }
);

// ==================================================
// PROCESSED APPLICATIONS
// ==================================================

// Prevents double-click / double decision
// while the bot is running.

const processedApplications =
    new Set();

// ==================================================
// BUTTON INTERACTIONS
// ==================================================

bot.on(
    "interactionCreate",
    async (interaction) => {

        if (!interaction.isButton()) {
            return;
        }

        // ------------------------------------------
        // CHECK BUTTON
        // ------------------------------------------

        const isAccept =
            interaction.customId.startsWith(
                "pd_accept:"
            );

        const isRefuse =
            interaction.customId.startsWith(
                "pd_refuse:"
            );

        if (
            !isAccept &&
            !isRefuse
        ) {
            return;
        }

        try {

            // ------------------------------------------
            // READ CUSTOM ID
            // ------------------------------------------

            const parts =
                interaction.customId.split(":");

            const applicantId =
                parts[1];

            const applicationId =
                parts[2];

            if (
                !applicantId ||
                !applicationId
            ) {
                return;
            }

            // ------------------------------------------
            // UNIQUE KEY
            // ------------------------------------------

            const applicationKey =
                `${interaction.message.id}:${applicationId}`;

            // ------------------------------------------
            // ALREADY PROCESSED?
            // ------------------------------------------

            if (
                processedApplications.has(
                    applicationKey
                )
            ) {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "⚠️ This application has already been processed.",

                        ephemeral: true
                    });
                }

                return;
            }

            // Lock immediately
            processedApplications.add(
                applicationKey
            );

            // ------------------------------------------
            // GET RESULTS CHANNEL
            // ------------------------------------------

            const resultChannel =
                await bot.channels.fetch(
                    RESULTS_CHANNEL_ID
                );

            if (
                !resultChannel ||
                !resultChannel.isTextBased()
            ) {

                processedApplications.delete(
                    applicationKey
                );

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ Results channel not found.",

                        ephemeral: true
                    });
                }

                return;
            }

            // ------------------------------------------
            // GET APPLICANT
            // ------------------------------------------

            const applicant =
                await bot.users
                    .fetch(applicantId)
                    .catch(
                        () => null
                    );

            if (!applicant) {

                processedApplications.delete(
                    applicationKey
                );

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ Applicant not found.",

                        ephemeral: true
                    });
                }

                return;
            }

            // ------------------------------------------
            // RESULT MESSAGE
            // ------------------------------------------

            let resultMessage;

            if (isAccept) {

                resultMessage =
                    `<@${applicantId}> Your Whitelist Application has been accepted ✅ Welcome aboard! , welcome to LSPD 💕 !`;

            } else {

                resultMessage =
                    `Sorry.. But Your PD application has been rejected.`;
            }

            // ------------------------------------------
            // SEND RESULT
            // ------------------------------------------

            await resultChannel.send({
                content:
                    resultMessage
            });

            // ------------------------------------------
            // LOG
            // ------------------------------------------

            if (isAccept) {

                console.log(
                    "================================="
                );

                console.log(
                    "✅ PD APPLICATION ACCEPTED"
                );

                console.log(
                    "Applicant:",
                    applicant.username
                );

                console.log(
                    "Discord ID:",
                    applicantId
                );

                console.log(
                    "================================="
                );

            } else {

                console.log(
                    "================================="
                );

                console.log(
                    "❌ PD APPLICATION REJECTED"
                );

                console.log(
                    "Applicant:",
                    applicant.username
                );

                console.log(
                    "Discord ID:",
                    applicantId
                );

                console.log(
                    "================================="
                );
            }

            // ------------------------------------------
            // DISABLE BUTTONS
            // ------------------------------------------

            const disabledRow =
                new ActionRowBuilder();

            for (
                const row of
                interaction.message.components
            ) {

                for (
                    const component of
                    row.components
                ) {

                    disabledRow.addComponents(
                        ButtonBuilder
                            .from(component)
                            .setDisabled(true)
                    );
                }
            }

            // ------------------------------------------
            // UPDATE APPLICATION MESSAGE
            // ------------------------------------------

            await interaction.update({
                components: [
                    disabledRow
                ]
            });

        } catch (error) {

            console.error(
                "❌ Button interaction error:",
                error
            );

            // ------------------------------------------
            // ALLOW RETRY IF ERROR
            // ------------------------------------------

            try {

                const parts =
                    interaction.customId
                        .split(":");

                const applicantId =
                    parts[1];

                const applicationId =
                    parts[2];

                if (
                    applicantId &&
                    applicationId
                ) {

                    processedApplications.delete(
                        `${interaction.message.id}:${applicationId}`
                    );
                }

            } catch {}

            // ------------------------------------------
            // REPLY TO INTERACTION
            // ------------------------------------------

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                try {

                    await interaction.reply({
                        content:
                            "❌ An error occurred while processing this application.",

                        ephemeral: true
                    });

                } catch (replyError) {

                    console.error(
                        "Could not reply to interaction:",
                        replyError
                    );
                }
            }
        }
    }
);

// ==================================================
// START SERVER
// ==================================================

if (require.main === module) {

    app.listen(
        PORT,
        () => {

            console.log(
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            );

            console.log(
                "🌐 PD WEBSITE"
            );

            console.log(
                `🌐 http://localhost:${PORT}`
            );

            console.log(
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            );
        }
    );
}

// ==================================================
// BOT LOGIN
// ==================================================

if (BOT_TOKEN) {

    bot.login(BOT_TOKEN)
        .then(() => {

            console.log(
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            );

            console.log(
                "🤖 PD APPLICATION BOT"
            );

            console.log(
                "✅ Discord bot connected"
            );

            console.log(
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            );

        })

        .catch((error) => {

            console.error(
                "❌ Discord bot login failed:",
                error
            );
        });

} else {

    console.error(
        "❌ DISCORD_BOT_TOKEN is missing."
    );
}

// ==================================================
// EXPORT
// ==================================================

module.exports = app;