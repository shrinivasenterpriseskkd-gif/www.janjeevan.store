const container = document.querySelector("#store-advertisements");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[char]));
const safeLink = value => {
    const link = String(value || "").trim();
    if ((link.startsWith("/") && !link.startsWith("//")) || link.startsWith("#")) return link;
    try {
        return new URL(link).protocol === "https:" ? link : "";
    } catch {
        return "";
    }
};

try {
    const apiBase = (window.TRIBES_API_BASE_URL || window.location.origin).replace(/\/$/, "");
    const response = await fetch(`${apiBase}/advertisements`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Advertisements could not be loaded.");
    const advertisements = Array.isArray(result.advertisements) ? result.advertisements : [];
    if (advertisements.length) {
        container.innerHTML = advertisements.map(advertisement => {
            const link = safeLink(advertisement.linkUrl);
            const content = `<img src="${escapeHtml(advertisement.imageUrl || "")}" alt="${escapeHtml(advertisement.title || "Featured advertisement")}" loading="lazy"><div class="store-advertisement-copy"><p class="store-kicker">Featured</p><h2>${escapeHtml(advertisement.title || "Discover more")}</h2>${advertisement.description ? `<p>${escapeHtml(advertisement.description)}</p>` : ""}${link ? `<span class="store-advertisement-link">Discover more <span aria-hidden="true">→</span></span>` : ""}</div>`;
            return link
                ? `<a class="store-advertisement-card" href="${escapeHtml(link)}"${link.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${content}</a>`
                : `<article class="store-advertisement-card">${content}</article>`;
        }).join("");
        container.hidden = false;
    }
} catch (error) {
    console.error("Could not load storefront advertisements.", error);
}
