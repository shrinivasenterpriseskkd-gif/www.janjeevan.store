import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

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

const inspirationPhotos = [
    { src: "photo-1578749556568-bc2c40e68b61", alt: "Handcrafted pottery and homewares" },
    { src: "photo-1513519245088-0e12902e5a38", alt: "Thoughtful details in a welcoming home" },
    { src: "photo-1494438639946-1ebd1d20bf85", alt: "Everyday objects arranged for a quiet moment" },
    { src: "photo-1544787219-7f47ccb76574", alt: "Tea served in a ceramic cup" },
    { src: "photo-1602143407151-7111542de6e8", alt: "Reusable bottle for everyday use" }
];

function startCarousel() {
    const track = el;
    const viewport = document.querySelector(".carousel-window");
    const next = document.querySelector("#next-product");
    const previous = document.querySelector("#previous-product");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

        track.scrollTo({ left: target, behavior: reducedMotion ? "auto" : "smooth" });
    };

    const stop = () => window.clearInterval(timer);
    const start = () => {
        stop();
        if (reducedMotion || document.hidden) return;
        timer = window.setInterval(() => move(1), 4500);
    };

    next.addEventListener("click", () => { move(1); start(); });
    previous.addEventListener("click", () => { move(-1); start(); });
    viewport.addEventListener("mouseenter", stop);
    viewport.addEventListener("mouseleave", start);
    viewport.addEventListener("focusin", stop);
    viewport.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", start);
    start();
}

try {
    const snapshot = await getDocs(collection(db, "products"));
    count.textContent = `${snapshot.size} product${snapshot.size === 1 ? "" : "s"} available`;
    el.innerHTML = snapshot.size ? snapshot.docs.map(document => {
        const product = document.data();
        return `<article class="card"><div class="card-image"><img src="${escapeHtml(product.imageUrl || "https://via.placeholder.com/400x300?text=TRIBES")}" alt="${escapeHtml(product.name || "Product")}"><span class="card-tag">In stock</span></div><div class="card-body"><div><h3>${escapeHtml(product.name || "Untitled product")}</h3><p>${escapeHtml(product.uom || "Unit")} · ${product.avlbStk ?? 0} available</p></div><strong class="price">₹${product.price ?? 0}</strong></div><button onclick="addCart('${document.id}')">Add to cart <span>→</span></button></article>`;
    }).join("") : "<div class=\"store-empty\"><h3>The collection is coming together.</h3><p>New products will appear here soon.</p></div>";
    if (snapshot.size > 1) startCarousel();
} catch (error) {
    count.textContent = "TRIBES photo preview";
    el.classList.add("photo-carousel");
    document.querySelector("#previous-product").setAttribute("aria-label", "Previous photos");
    document.querySelector("#next-product").setAttribute("aria-label", "Next photos");
    el.innerHTML = inspirationPhotos.map((photo, index) => `
		<article class="photo-slide">
			<img src="https://images.unsplash.com/${photo.src}?auto=format&fit=crop&w=900&q=80" alt="${escapeHtml(photo.alt)}" ${index < 3 ? "fetchpriority=high" : "loading=lazy"}>
			<span>TRIBES · Everyday inspiration</span>
		</article>`).join("");
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