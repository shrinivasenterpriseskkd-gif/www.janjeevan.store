const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
const section = document.querySelector("#store-advertisements");
const list = document.querySelector("#store-advertisement-list");
const viewport = document.querySelector("#advertisement-carousel-window");
const count = document.querySelector("#advertisement-count");
const previous = document.querySelector("#previous-advertisement");
const next = document.querySelector("#next-advertisement");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[character]));
let timer;
let loopResetTimer;
let advertisementCount = 0;

const safeAdvertisementLink = value => {
    const link = String(value || "");
    if ((link.startsWith("/") && !link.startsWith("//")) || link.startsWith("#")) return link;
    try {
        const url = new URL(link);
        return url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
};

const moveAdvertisementCarousel = direction => {
    if (advertisementCount < 2) return;
    const firstCard = list.querySelector(".store-advertisement-card");
    if (!firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const step = firstCard.getBoundingClientRect().width + gap;
    if (!step) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let currentIndex = Math.round(viewport.scrollLeft / step);

    if (direction < 0 && currentIndex <= 0) {
        viewport.scrollTo({ left: advertisementCount * step, behavior: "auto" });
        currentIndex = advertisementCount;
    }

    const targetIndex = currentIndex + direction;
    if (direction > 0 && targetIndex >= advertisementCount) {
        viewport.scrollTo({ left: advertisementCount * step, behavior: reducedMotion ? "auto" : "smooth" });
        window.clearTimeout(loopResetTimer);
        loopResetTimer = window.setTimeout(() => {
            if (viewport.scrollLeft >= advertisementCount * step - 2) {
                viewport.scrollTo({ left: 0, behavior: "auto" });
            }
        }, reducedMotion ? 0 : 500);
        return;
    }

    viewport.scrollTo({
        left: Math.max(0, targetIndex) * step,
        behavior: reducedMotion ? "auto" : "smooth"
    });
};

const stopCarousel = () => window.clearInterval(timer);
const startCarousel = () => {
    stopCarousel();
    if (advertisementCount < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
    timer = window.setInterval(() => moveAdvertisementCarousel(1), 5000);
};

try {
    const response = await fetch(`${apiBase}/api/advertisements`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Featured advertisements are unavailable.");
    const advertisements = Array.isArray(result.advertisements) ? result.advertisements : [];
    advertisementCount = advertisements.length;
    if (advertisements.length) {
        const cards = advertisements.map(advertisement => {
            const safeLink = safeAdvertisementLink(advertisement.linkUrl);
            const contents = `<img src="${escapeHtml(advertisement.imageUrl)}" alt="${escapeHtml(advertisement.title || "Featured advertisement")}">
                <div class="store-advertisement-copy">
                    <h3>${escapeHtml(advertisement.title || "Featured offer")}</h3>
                    ${advertisement.description ? `<p>${escapeHtml(advertisement.description)}</p>` : ""}
                </div>`;
            return `<article class="store-advertisement-card">${safeLink
                ? `<a href="${escapeHtml(safeLink)}" ${safeLink.startsWith("https:") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${contents}</a>`
                : contents}</article>`;
        });
        list.innerHTML = cards.join("");
        [...list.children].forEach(originalCard => {
            const clone = originalCard.cloneNode(true);
            clone.setAttribute("aria-hidden", "true");
            clone.querySelectorAll("a").forEach(link => link.setAttribute("tabindex", "-1"));
            list.append(clone);
        });
        count.textContent = `${advertisements.length} advertisement${advertisements.length === 1 ? "" : "s"}`;
        section.hidden = false;
        previous.addEventListener("click", () => { moveAdvertisementCarousel(-1); startCarousel(); });
        next.addEventListener("click", () => { moveAdvertisementCarousel(1); startCarousel(); });
        viewport.addEventListener("mouseenter", stopCarousel);
        viewport.addEventListener("mouseleave", startCarousel);
        viewport.addEventListener("focusin", stopCarousel);
        viewport.addEventListener("focusout", event => {
            if (!viewport.contains(event.relatedTarget)) startCarousel();
        });
        document.addEventListener("visibilitychange", startCarousel);
        window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", startCarousel);
        startCarousel();
    }
} catch (error) {
    console.error("Could not load storefront advertisements.", error);
}
