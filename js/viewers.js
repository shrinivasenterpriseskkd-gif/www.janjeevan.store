const counter = document.querySelector("#viewer-count");

if (counter) {
    const storageKey = "tribesViewerCount";
    const sessionKey = "tribesViewerSession";

    const existingCount = Number(localStorage.getItem(storageKey) || "0");
    const hasSession = sessionStorage.getItem(sessionKey);

    if (!hasSession) {
        const nextCount = existingCount + 1;
        localStorage.setItem(storageKey, String(nextCount));
        sessionStorage.setItem(sessionKey, "active");
        counter.textContent = nextCount.toLocaleString();
    } else {
        counter.textContent = existingCount.toLocaleString();
    }
}
