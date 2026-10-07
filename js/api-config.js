const isLocalServer = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.TRIBES_API_BASE_URL = window.TRIBES_API_BASE_URL || (isLocalServer ? window.location.origin : "https://www.janjeevan.store");
