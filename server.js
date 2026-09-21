require("dotenv").config();

const express = require("express");
const session = require("express-session");
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

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const GUILD_ID = process.env.DISCORD_GUILD_ID;

const APPLICATION_CHANNEL_ID =
    process.env.APPLICATION_CHANNEL_ID;

const RESULTS_CHANNEL_ID =
    process.env.RESULTS_CHANNEL_ID;

const REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    "http://localhost:" + PORT + "/auth/discord/callback";


// ==================================================
// DISCORD BOT
// ==================================================

const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});


// ==================================================
// EXPRESS
// ==================================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "pd-secret-change-me",

        resave: false,

        saveUninitialized: false,

        cookie: {
            maxAge:
                1000 * 60 * 60 * 24
        }
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ==================================================
// OAUTH STATE
// ==================================================

const oauthStates = new Map();


// ==================================================
// DISCORD LOGIN
// ==================================================

app.get(
    "/auth/discord",
    (req, res) => {

        const join =
            req.query.join === "1";

        const state =
            crypto
                .randomBytes(24)
                .toString("hex");

        oauthStates.set(
            state,
            {
                join,
                created: Date.now()
            }
        );

        const scopes =
            join
                ? "identify guilds.join"
                : "identify";

        const params =
            new URLSearchParams({

                client_id:
                    CLIENT_ID,

                response_type:
                    "code",

                redirect_uri:
                    REDIRECT_URI,

                scope:
                    scopes,

                state
            });

        res.redirect(
            "https://discord.com/oauth2/authorize?" +
            params.toString()
        );
    }
);


// ==================================================
// DISCORD OAUTH CALLBACK
// ==================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            const {
                code,
                state
            } = req.query;


            if (!code || !state) {

                return res
                    .status(400)
                    .send(
                        "Invalid OAuth request."
                    );
            }


            const savedState =
                oauthStates.get(state);


            if (!savedState) {

                return res
                    .status(400)
                    .send(
                        "Invalid or expired state."
                    );
            }


            oauthStates.delete(state);


            // ==========================================
            // EXCHANGE CODE
            // ==========================================

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
                            new URLSearchParams({

                                client_id:
                                    CLIENT_ID,

                                client_secret:
                                    CLIENT_SECRET,

                                grant_type:
                                    "authorization_code",

                                code,

                                redirect_uri:
                                    REDIRECT_URI
                            })
                    }
                );


            const tokenData =
                await tokenResponse.json();


            if (!tokenData.access_token) {

                console.log(
                    "OAuth Error:",
                    tokenData
                );

                return res
                    .status(400)
                    .send(
                        "Discord OAuth failed."
                    );
            }


            // ==========================================
            // GET DISCORD USER
            // ==========================================

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


            if (!user.id) {

                console.log(
                    "Discord User Error:",
                    user
                );

                return res
                    .status(400)
                    .send(
                        "Unable to get Discord user."
                    );
            }


            // ==========================================
            // SAVE SESSION
            // ==========================================

            req.session.user = {

                id:
                    user.id,

                username:
                    user.username,

                global_name:
                    user.global_name,

                avatar:
                    user.avatar
            };


            // ==========================================
            // JOIN DISCORD SERVER
            // ==========================================

            if (
                savedState.join &&
                tokenData.scope &&
                tokenData.scope.includes(
                    "guilds.join"
                )
            ) {

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


                if (!joinResponse.ok) {

                    const errorText =
                        await joinResponse.text();

                    console.log(
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
            }


            res.redirect("/");

        } catch (error) {

            console.error(
                "OAuth Error:",
                error
            );

            res
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

        if (!req.session.user) {

            return res.json({
                loggedIn: false
            });
        }


        res.json({

            loggedIn: true,

            user:
                req.session.user
        });
    }
);


// ==================================================
// LOGOUT
// ==================================================

app.get(
    "/logout",
    (req, res) => {

        req.session.destroy(
            () => {

                res.redirect("/");

            }
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

            // ==========================================
            // CHECK LOGIN
            // ==========================================

            if (!req.session.user) {

                return res
                    .status(401)
                    .json({

                        success: false,

                        message:
                            "Lezem ta3mel Login with Discord."

                    });
            }


            const user =
                req.session.user;


            // ==========================================
            // GET ANSWERS
            // ==========================================

            const answers =
                req.body.answers ||
                req.body;


            console.log(
                "Application received from:",
                user.username
            );


            // ==========================================
            // CHECK ALL QUESTIONS
            // ==========================================

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


            // ==========================================
            // GET APPLICATION CHANNEL
            // ==========================================

            const channel =
                await bot.channels.fetch(
                    APPLICATION_CHANNEL_ID
                );


            if (!channel) {

                throw new Error(
                    "Application channel not found."
                );
            }


            // ==========================================
            // CHECK CHANNEL TYPE
            // ==========================================

            if (
                !channel.isTextBased()
            ) {

                throw new Error(
                    "Application channel is not a text channel."
                );
            }


            // ==========================================
            // CREATE EMBED
            // ==========================================

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

                        "**\n" +

                        "🆔 Discord ID: **" +
                        user.id +
                        "**"

                    )

                    .setColor(
                        0x1769aa
                    )

                    .setTimestamp();


            // ==========================================
            // AVATAR
            // ==========================================

            if (user.avatar) {

                embed.setThumbnail(

                    "https://cdn.discordapp.com/avatars/" +
                    user.id +
                    "/" +
                    user.avatar +
                    ".png"

                );
            }


            // ==========================================
            // ADD QUESTIONS
            // ==========================================

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


            // ==========================================
            // BUTTONS
            // ==========================================

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


            // ==========================================
            // SEND APPLICATION TO DISCORD
            // ==========================================

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
                "Discord message ID: " +
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
// DISCORD BUTTON INTERACTIONS
// ==================================================

bot.on(
    "interactionCreate",
    async (interaction) => {

        if (!interaction.isButton()) {
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


            // ==========================================
            // RESULTS CHANNEL
            // ==========================================

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


            // ==========================================
            // GET APPLICANT
            // ==========================================

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


            // ==========================================
            // RESULT MESSAGE
            // ==========================================

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


            // ==========================================
            // UPDATE ORIGINAL MESSAGE
            // ==========================================

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


            if (!interaction.replied) {

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
// START WEBSITE
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
// START DISCORD BOT
// ==================================================

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