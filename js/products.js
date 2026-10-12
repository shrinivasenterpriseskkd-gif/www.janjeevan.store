import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { andhraPradeshMarketPhotos } from "./market-photos.js";

const el = document.querySelector("#products");
const count = document.querySelector("#product-count");
const notice = document.querySelector("#collection-notice");
const escapeHtml = value => String(value ?? "").replace(/[&<>\'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[char]));
const effectivePrice = product => Math.round((Number(product.price) || 0) * (1 - Math.min(100, Math.max(0, Number(product.discountPercent) || 0)) / 100) * 100) / 100;
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const formatPercent = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function startCarousel() {
    const track = el;
    const viewport = document.querySelector(".carousel-window");
    const next = document.querySelector("#next-product");
    const previous = document.querySelector("#previous-product");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;

    const move = direction => {
        const maxScroll = track.scrollWidth - track.clientWidth;
        if (maxScroll <= 0) return;

        const current = track.scrollLeft;
        const atStart = current <= 4;
        const atEnd = current >= maxScroll - 4;
        const distance = track.clientWidth * 0.82;
        let target = current + direction * distance;

        if (direction > 0 && atEnd) target = 0;
        else if (direction < 0 && atStart) target = maxScroll;
        else target = Math.max(0, Math.min(maxScroll, target));

        track.scrollTo({ left: target, behavior: reducedMotion.matches ? "auto" : "smooth" });
    };

    const stop = () => window.clearInterval(timer);
    const start = () => {
        stop();
        if (reducedMotion.matches || document.hidden) return;
        timer = window.setInterval(() => move(1), 4500);
    };

    next.addEventListener("click", () => { move(1); start(); });
    previous.addEventListener("click", () => { move(-1); start(); });
    viewport.addEventListener("mouseenter", stop);
    viewport.addEventListener("mouseleave", start);
    viewport.addEventListener("focusin", stop);
    viewport.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", start);
    reducedMotion.addEventListener("change", start);
    start();
}

try {
    const snapshot = await getDocs(collection(db, "products"));
    count.textContent = `${snapshot.size} product${snapshot.size === 1 ? "" : "s"} available`;
    el.innerHTML = snapshot.size ? snapshot.docs.map(document => {
        const product = document.data();
        const discount = Math.min(100, Math.max(0, Number(product.discountPercent) || 0));
        const gstPercent = formatPercent(product.gstPercent);
        const price = effectivePrice(product);
        return `<article class="card"><div class="card-image"><img src="${escapeHtml(product.imageUrl || "https://via.placeholder.com/400x300?text=Janjeevan.store")}" alt="${escapeHtml(product.name || "Product")}"><span class="card-tag">In stock</span>${discount ? `<span class="discount-tag">${discount}% off</span>` : ""}</div><div class="card-body"><div><h3>${escapeHtml(product.name || "Untitled product")}</h3><p>${escapeHtml(product.uom || "Unit")} · ${product.avlbStk ?? 0} available</p><p>GST: ${gstPercent}%</p></div><div class="price-line"><strong class="price">${money(price)}</strong>${discount ? `<s>${money(product.price)}</s>` : ""}</div></div><button onclick="addCart('${document.id}')">Add to cart <span>→</span></button></article>`;
    }).join("") : "<div class=\"store-empty\"><h3>The collection is coming together.</h3><p>New products will appear here soon.</p></div>";
    if (snapshot.size > 1) startCarousel();
} catch (error) {
    count.textContent = "Andhra Pradesh tribal market photos";
    el.classList.add("photo-carousel");
    document.querySelector("#previous-product").setAttribute("aria-label", "Previous photos");
    document.querySelector("#next-product").setAttribute("aria-label", "Next photos");
    el.innerHTML = andhraPradeshMarketPhotos.map((photo, index) => `
		<article class="photo-slide">
			<img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" ${index < 2 ? "fetchpriority=high" : "loading=lazy"}>
			<div class="photo-slide-caption"><span>${escapeHtml(photo.caption)}</span><small>Photo: <a href="${escapeHtml(photo.fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(photo.artist)} · ${escapeHtml(photo.license)}</a></small></div>
		</article>`).join("");
    el.setAttribute("aria-label", "Andhra Pradesh tribal market photos");
    notice.hidden = false;
    startCarousel();
    console.error(error);
}

window.addCart = id => {
    const cart = JSON.parse(localStorage.getItem("tribesCart") || "[]");
    cart.push(id);
    localStorage.setItem("tribesCart", JSON.stringify(cart));
    alert("Added to cart");
};