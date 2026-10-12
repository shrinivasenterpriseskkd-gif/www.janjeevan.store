const form = document.getElementById("admin-login-form");
const statusBox = document.getElementById("admin-login-status");
const submitButton = document.getElementById("admin-login-submit");
const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");

const setStatus = (message, isError = false) => {
    statusBox.textContent = message;
    statusBox.classList.toggle("error", isError);
};

const checkSession = async () => {
    if (!apiBase) {
        setStatus("Admin sign-in requires the TRIBES server. GitHub Pages cannot run the secure Admin service.", true);
        return;
    }

    try {
        const response = await fetch(`${apiBase}/api/admin/session`, { credentials: "include" });
        if (!response.ok) throw new Error("Admin sign-in service is unavailable.");
        const session = await response.json();
        if (session.authenticated) window.location.replace("index.html");
    } catch (error) {
        console.error("Could not check the Admin session.", error);
        setStatus("Could not connect to the Admin sign-in service. Please try again later.", true);
    }
};

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    if (!apiBase) {
        setStatus("Admin sign-in requires the TRIBES server. GitHub Pages cannot run the secure Admin service.", true);
        return;
    }

    submitButton.disabled = true;
    setStatus("Signing in...");
    try {
        const response = await fetch(`${apiBase}/api/admin/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                loginId: document.getElementById("admin-login-id").value,
                password: document.getElementById("admin-login-password").value
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Admin sign-in failed.");
        window.location.replace("index.html");
    } catch (error) {
        console.error("Admin sign-in failed.", error);
        setStatus(error.message, true);
        submitButton.disabled = false;
    }
});

checkSession();
