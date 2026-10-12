const isLocalServer = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const defaultApiBase = isLocalServer ? window.location.origin : "https://api.janjeevan.store";
window.TRIBES_API_BASE_URL = window.TRIBES_API_BASE_URL || defaultApiBase;
