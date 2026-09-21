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
    process.env.SESSION_SECRET ||
    "change-this-session-secret";

const REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    `http://localhost:${PORT}/auth/discord/callback`;

const IS_NETLIFY =
    process.env.NETLIFY === "true" ||
    !!process.env.NETLIFY_FUNCTIONS_VERSION;

// ==================================================
// CONFIG CHECK
// ==================================================

console.log("=================================");
console.log("PD APPLICATION CONFIG");
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
    "NETLIFY:",
    IS_NETLIFY ? "YES" : "NO"
);

console.log("=================================");

// ==================================================
// EXPRESS
// ==================================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

// ==================================================
// COOKIE HELPERS
// ==================================================

function parseCookies(req) {

    const header =
        req.headers.cookie;

    if (!header) {
        return {};
    }

    const cookies = {};

    header
        .split(";")
        .forEach((part) => {

            const index =
                part.indexOf("=");

            if (index === -1) {
                return;
            }

            const key =
                part
                    .slice(0, index)
                    .trim();

            const value =
                part
                    .slice(index + 1)
                    .trim();

            cookies[key] =
                decodeURIComponent(value);

        });

    return cookies;
}


function base64urlEncode(value) {

    return Buffer
        .from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

}


function base64urlDecode(value) {

    value =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    while (
        value.length % 4
    ) {
        value += "=";
    }

    return Buffer
        .from(value, "base64")
        .toString();
}


function createSignature(data) {

    return crypto
        .createHmac(
            "sha256",
            SESSION_SECRET
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

    return encoded +
        "." +
        signature;

}


function verifySignedValue(value) {

    if (!value) {
        return null;
    }

    const parts =
        value.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const encoded =
        parts[0];

    const signature =
        parts[1];

    const expected =
        createSignature(encoded);

    try {

        if (
            !crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expected)
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


function setCookie(
    res,
    name,
    value,
    maxAge
) {

    const secure =
        IS_NETLIFY ||
        process.env.NODE_ENV === "production";

    let cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        "; Path=/; HttpOnly; SameSite=Lax";

    if (maxAge !== undefined) {

        cookie +=
            "; Max-Age=" +
            Math.floor(maxAge / 1000);

    }

    if (secure) {

        cookie +=
            "; Secure";

    }

    const existing =
        res.getHeader("Set-Cookie");

    const list =
        existing
            ? Array.isArray(existing)
                ? existing
                : [existing]
            : [];

    list.push(cookie);

    res.setHeader(
        "Set-Cookie",
        list
    );

}


function clearCookie(
    res,
    name
) {

    setCookie(
        res,
        name,
        "",
        0
    );

}

// ==================================================
// USER COOKIE
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

    // 24 hours
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


function saveLoggedUser(
    res,
    user
) {

    const value =
        createSignedValue({

            user: {

                id:
                    user.id,

                username:
                    user.username,

                global_name:
                    user.global_name,

                avatar:
                    user.avatar

            },

            created:
                Date.now()

        });

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
// STATIC WEBSITE
// ==================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

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

            if (!REDIRECT_URI) {

                return res
                    .status(500)
                    .send(
                        "DISCORD_REDIRECT_URI is missing."
                    );

            }

            // ==================================================
            // CREATE STATE
            // ==================================================

            const state =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            const join =
                req.query.join === "1";

            const stateValue =
                createSignedValue({

                    state,

                    join,

                    created:
                        Date.now()

                });

            setCookie(
                res,
                "pd_oauth_state",
                stateValue,
                10 * 60 * 1000
            );

            // ==================================================
            // DISCORD OAUTH
            // ==================================================

            const params =
                new URLSearchParams();

            params.set(
                "client_id",
                String(CLIENT_ID)
            );

            params.set(
                "response_type",
                "code"
            );

            params.set(
                "redirect_uri",
                String(REDIRECT_URI)
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
                "DISCORD OAUTH LOGIN"
            );

            console.log(
                "CLIENT_ID:",
                CLIENT_ID
            );

            console.log(
                "REDIRECT_URI:",
                REDIRECT_URI
            );

            console.log(
                "SCOPE:",
                join
                    ? "identify guilds.join"
                    : "identify"
            );

            console.log(
                "STATE CREATED: OK"
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

            const code =
                req.query.code;

            const state =
                req.query.state;

            const error =
                req.query.error;

            // ==================================================
            // DISCORD ERROR
            // ==================================================

            if (error) {

                console.error(
                    "Discord OAuth returned error:",
                    error
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

            // ==================================================
            // CHECK CODE / STATE
            // ==================================================

            if (
                !code ||
                !state
            ) {

                return res
                    .status(400)
                    .send(
                        "Invalid OAuth request."
                    );

            }

            // ==================================================
            // READ STATE COOKIE
            // ==================================================

            const cookies =
                parseCookies(req);

            const savedState =
                verifySignedValue(
                    cookies.pd_oauth_state
                );

            if (!savedState) {

                console.error(
                    "OAuth state cookie missing or invalid."
                );

                return res
                    .status(400)
                    .send(
                        "Invalid or expired OAuth state."
                    );

            }

            // ==================================================
            // CHECK STATE
            // ==================================================

            if (
                savedState.state !==
                state
            ) {

                console.error(
                    "OAuth state mismatch."
                );

                return res
                    .status(400)
                    .send(
                        "Invalid OAuth state."
                    );

            }

            // ==================================================
            // CHECK EXPIRATION
            // ==================================================

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

            // State used successfully
            clearCookie(
                res,
                "pd_oauth_state"
            );

            // ==================================================
            // EXCHANGE CODE FOR TOKEN
            // ==================================================

            const tokenParams =
                new URLSearchParams();

            tokenParams.set(
                "client_id",
                String(CLIENT_ID)
            );

            tokenParams.set(
                "client_secret",
                String(CLIENT_SECRET)
            );

            tokenParams.set(
                "grant_type",
                "authorization_code"
            );

            tokenParams.set(
                "code",
                String(code)
            );

            tokenParams.set(
                "redirect_uri",
                String(REDIRECT_URI)
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
                "Discord token response:",
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

            // ==================================================
            // GET DISCORD USER
            // ==================================================

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

            // ==================================================
            // SAVE USER IN SIGNED COOKIE
            // ==================================================

            saveLoggedUser(
                res,
                user
            );

            console.log(
                "Discord user logged in:",
                user.username
            );

            // ==================================================
            // JOIN SERVER
            // ==================================================

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

                                "https://discord.com/api/guilds/" +
                                GUILD_ID +
                                "/members/" +
                                user.id,

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
                                user.username +
                                " joined the Discord server."
                            );

                        }

                    } catch (joinError) {

                        console.error(
                            "Guild join request error:",
                            joinError
                        );

                    }

                }

            }

            // ==================================================
            // SUCCESS
            // ==================================================

            return res.redirect("/");

        } catch (error) {

            console.error(
                "OAuth callback error:",
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

        if (!user) {

            return res.json({

                loggedIn: false

            });

        }

        return res.json({

            loggedIn: true,

            user

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

        return res.redirect(
            "/"
        );

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

            // ==================================================
            // CHECK LOGIN
            // ==================================================

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

            const answers =
                req.body.answers ||
                req.body;

            console.log(
                "Application received from:",
                user.username
            );

            // ==================================================
            // CHECK QUESTIONS
            // ==================================================

            for (
                let i = 1;
                i <= questions.length;
                i++
            ) {

                const answer =
                    answers["q" + i];

                if (
                    !answer ||
                    String(answer)
                        .trim() === ""
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

            // ==================================================
            // CHECK BOT
            // ==================================================

            if (!bot.isReady()) {

                return res
                    .status(503)
                    .json({

                        success: false,

                        message:
                            "Discord bot is not ready."

                    });

            }

            // ==================================================
            // GET APPLICATION CHANNEL
            // ==================================================

            const channel =
                await bot.channels.fetch(
                    APPLICATION_CHANNEL_ID
                );

            if (!channel) {

                throw new Error(
                    "Application channel not found."
                );

            }

            if (
                !channel.isTextBased()
            ) {

                throw new Error(
                    "Application channel is not a text channel."
                );

            }

            // ==================================================
            // CREATE EMBED
            // ==================================================

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

                    .setColor(
                        0x1769aa
                    )

                    .setTimestamp();

            // ==================================================
            // AVATAR
            // ==================================================

            if (user.avatar) {

                embed.setThumbnail(

                    "https://cdn.discordapp.com/avatars/" +
                    user.id +
                    "/" +
                    user.avatar +
                    ".png"

                );

            }

            // ==================================================
            // QUESTIONS
            // ==================================================

            questions.forEach(
                (
                    question,
                    index
                ) => {

                    const answer =
                        String(
                            answers[
                                "q" +
                                (index + 1)
                            ]
                        )
                            .trim()
                            .slice(
                                0,
                                1024
                            );

                    embed.addFields({

                        name:
                            (
                                index + 1
                            ) +
                            ". " +
                            question,

                        value:
                            answer ||
                            "Aucune réponse"

                    });

                }
            );

            // ==================================================
            // BUTTONS
            // ==================================================

            const buttons =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()

                            .setCustomId(
                                "pd_accept:" +
                                user.id
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
                                "pd_refuse:" +
                                user.id
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

            // ==================================================
            // SEND APPLICATION
            // ==================================================

            const sentMessage =
                await channel.send({

                    embeds: [
                        embed
                    ],

                    components: [
                        buttons
                    ]

                });

            console.log(
                "✅ PD application submitted by " +
                user.username +
                " (" +
                user.id +
                ")"
            );

            console.log(
                "Discord message ID:",
                sentMessage.id
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
// BUTTON INTERACTIONS
// ==================================================

bot.on(
    "interactionCreate",
    async (interaction) => {

        if (
            !interaction.isButton()
        ) {
            return;
        }

        if (
            !interaction.customId.startsWith(
                "pd_accept:"
            ) &&
            !interaction.customId.startsWith(
                "pd_refuse:"
            )
        ) {

            return;
        }

        try {

            const accepted =
                interaction.customId.startsWith(
                    "pd_accept:"
                );

            const applicantId =
                interaction.customId.split(":")[1];

            // ==================================================
            // RESULTS CHANNEL
            // ==================================================

            const resultChannel =
                await bot.channels.fetch(
                    RESULTS_CHANNEL_ID
                );

            if (!resultChannel) {

                return interaction.reply({

                    content:
                        "❌ Results channel not found.",

                    ephemeral: true

                });

            }

            // ==================================================
            // APPLICANT
            // ==================================================

            const applicant =
                await bot.users.fetch(
                    applicantId
                ).catch(
                    () => null
                );

            const applicantName =
                applicant
                    ? applicant.username +
                      " (" +
                      applicant.id +
                      ")"
                    : applicantId;

            // ==================================================
            // RESULT
            // ==================================================

            const resultMessage =
                accepted

                    ? "✅ **PD Application ACCEPTED**\n" +
                      "👤 Applicant: " +
                      applicantName

                    : "❌ **PD Application REFUSED**\n" +
                      "👤 Applicant: " +
                      applicantName;

            await resultChannel.send(
                resultMessage
            );

            // ==================================================
            // UPDATE BUTTON MESSAGE
            // ==================================================

            await interaction.update({

                content:
                    accepted
                        ? "✅ Application accepted."
                        : "❌ Application refused.",

                components: []

            });

        } catch (error) {

            console.error(
                "❌ Button interaction error:",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        "❌ An error occurred.",

                    ephemeral: true

                });

            }

        }

    }
);

// ==================================================
// START WEBSITE LOCALLY
// ==================================================

if (
    require.main === module
) {

    app.listen(
        PORT,
        () => {

            console.log(
                "🌐 Website: http://localhost:" +
                PORT
            );

        }
    );

}

// ==================================================
// EXPORT APP
// ==================================================

module.exports = app;

// ==================================================
// DISCORD BOT
// ==================================================
//
// IMPORTANT:
// On Netlify, a Discord.js persistent bot should NOT
// be kept alive inside the serverless function.
//
// So we only start the bot when running locally.
//
// ==================================================

if (
    BOT_TOKEN &&
    !IS_NETLIFY
) {

    bot.login(
        BOT_TOKEN
    )
        .then(
            () => {

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

            }
        )
        .catch(
            (error) => {

                console.error(
                    "❌ Discord bot login failed:",
                    error
                );

            }
        );

} else if (
    IS_NETLIFY
) {

    console.log(
        "☁️ Netlify mode: Discord bot login disabled."
    );

} else {

    console.error(
        "❌ DISCORD_BOT_TOKEN is missing."
    );

}