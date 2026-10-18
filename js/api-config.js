const isLocalServer = [
  "localhost",
  "127.0.0.1",
  "::1"
].includes(window.location.hostname) ||
  window.location.hostname.endsWith(".run.app") ||
  window.location.hostname.endsWith(".aistudio.google");

const defaultApiBase = isLocalServer
  ? window.location.origin
  : "https://us-central1-janjeevanstore.cloudfunctions.net/api";

window.TRIBES_API_BASE_URL = window.TRIBES_API_BASE_URL || defaultApiBase;
