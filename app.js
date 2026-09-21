// ==============================
// DISCORD USER
// ==============================

async function checkDiscordUser() {
    try {
        const response = await fetch("/api/me");
        const data = await response.json();

        const discordUser = document.getElementById("discordUser");
        const discordAvatar = document.getElementById("discordAvatar");
        const discordName = document.getElementById("discordName");

        if (!discordUser) return;

        if (data.loggedIn && data.user) {
            discordUser.classList.remove("hidden");

            discordName.textContent =
                data.user.global_name ||
                data.user.username ||
                "Discord User";

            if (data.user.avatar) {
                discordAvatar.src =
                    `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=128`;
            } else {
                discordAvatar.src =
                    "https://cdn.discordapp.com/embed/avatars/0.png";
            }
        } else {
            discordUser.classList.add("hidden");
        }

    } catch (error) {
        console.error("Discord user error:", error);
    }
}

checkDiscordUser();


// ==============================
// APPLY PD BUTTON
// ==============================

const applyButton = document.getElementById("applyButton");
const applicationSection = document.getElementById("applicationSection");

if (applyButton) {

    applyButton.addEventListener("click", async () => {

        try {

            const response = await fetch("/api/me");
            const data = await response.json();

            if (!data.loggedIn) {
                window.location.href = "/auth/discord";
                return;
            }

            applicationSection.classList.remove("hidden");

            applicationSection.scrollIntoView({
                behavior: "smooth"
            });

        } catch (error) {

            console.error("Apply error:", error);

            alert("Erreur de connexion Discord.");

        }

    });

}


// ==============================
// APPLICATION FORM
// ==============================

const applicationForm =
    document.getElementById("applicationForm");

const formMessage =
    document.getElementById("formMessage");


if (applicationForm) {

    applicationForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        console.log("🚀 SUBMIT CLICKED");

        formMessage.textContent =
            "⏳ Sending application...";

        formMessage.className =
            "form-message";


        // Get all answers
        const formData =
            new FormData(applicationForm);

        const answers = {};


        for (let i = 1; i <= 24; i++) {

            const answer =
                formData.get(`q${i}`);

            answers[`q${i}`] =
                answer ? answer.trim() : "";

        }


        console.log("📨 Answers:", answers);


        try {

            const response = await fetch(
                "/api/application",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        answers: answers
                    })
                }
            );


            console.log(
                "📡 Response status:",
                response.status
            );


            const data =
                await response.json();


            console.log(
                "📡 Server response:",
                data
            );


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    data.error ||
                    "Application failed."
                );

            }


            // SUCCESS

            formMessage.textContent =
                "✅ Application sent successfully!";

            formMessage.className =
                "form-message success";


            applicationForm.reset();


        } catch (error) {

            console.error(
                "❌ Application error:",
                error
            );


            formMessage.textContent =
                "❌ " + error.message;

            formMessage.className =
                "form-message error";

        }

    });

}