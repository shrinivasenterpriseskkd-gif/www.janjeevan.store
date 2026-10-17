import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const productList = document.querySelector("#products");
const productCount = document.querySelector("#product-count");
const productFilters = document.querySelector("#product-filters");
const categoryFilter = document.querySelector("#product-category-filter");
const productSearch = document.querySelector("#product-search");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[character]));
const effectivePrice = product => Math.round((Number(product.price) || 0) *
    (1 - Math.min(100, Math.max(0, Number(product.discountPercent) || 0)) / 100) * 100) / 100;
const money = value => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(Number(value) || 0);

function startCarousel() {
    const viewport = document.querySelector(".carousel-window");
    const next = document.querySelector("#next-product");
    const previous = document.querySelector("#previous-product");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;

    const move = direction => {
        const maxScroll = productList.scrollWidth - productList.clientWidth;
        if (maxScroll <= 0) return;
        const atStart = productList.scrollLeft <= 4;
        const atEnd = productList.scrollLeft >= maxScroll - 4;
        const distance = productList.clientWidth * 0.82;
        const target = direction > 0 && atEnd
            ? 0
            : direction < 0 && atStart
                ? maxScroll
                : Math.max(0, Math.min(maxScroll, productList.scrollLeft + direction * distance));
        productList.scrollTo({ left: target, behavior: reducedMotion.matches ? "auto" : "smooth" });
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

function addProductToCart(id) {
    let cart;
    try {
        const savedCart = JSON.parse(localStorage.getItem("tribesCart") || "[]");
        cart = Array.isArray(savedCart) ? savedCart.filter(item => typeof item === "string") : [];
    } catch (error) {
        console.error("Could not read the saved cart.", error);
        cart = [];
    }
    cart.push(id);
    try {
        localStorage.setItem("tribesCart", JSON.stringify(cart));
        window.location.assign("cart.html");
    } catch (error) {
        console.error("Could not save the product to the cart.", error);
        productCount.textContent = "Cart unavailable. Enable browser storage and try again.";
    }
}

try {
    const snapshot = await getDocs(collection(db, "products"));
    const products = snapshot.docs.map(document => ({ id: document.id, ...document.data() })).filter(product =>
        typeof product.name === "string" &&
        Number.isFinite(Number(product.price)) && Number(product.price) >= 0
    );
    const categories = new Map();
    products.forEach(product => {
        const category = String(product.category || "Uncategorized").trim() || "Uncategorized";
        if (!categories.has(category.toLocaleLowerCase())) categories.set(category.toLocaleLowerCase(), category);
    });
    [...categories.values()].sort((first, second) => first.localeCompare(second)).forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.append(option);
    });
    const renderProducts = () => {
        const query = productSearch.value.trim().toLocaleLowerCase();
        const selectedCategory = categoryFilter.value;
        const filteredProducts = products.filter(product => {
            const category = String(product.category || "Uncategorized").trim() || "Uncategorized";
            return (!selectedCategory || category.toLocaleLowerCase() === selectedCategory.toLocaleLowerCase()) &&
                String(product.name || "").toLocaleLowerCase().includes(query);
        });
        productCount.textContent = `${filteredProducts.length} of ${products.length} product${products.length === 1 ? "" : "s"}`;
        productList.innerHTML = !products.length ? `<div class="store-empty"><h3>No products are available yet.</h3>
            <p>Please check back soon.</p></div>` : filteredProducts.length ? filteredProducts.map(product => {
            const discount = Math.min(100, Math.max(0, Number(product.discountPercent) || 0));
            const category = String(product.category || "Uncategorized").trim() || "Uncategorized";
            const stock = Number(product.avlbStk);
            const inStock = Number.isFinite(stock) && stock > 0;
            return `<article class="card">
            <div class="card-image">
                <img src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name)}" loading="lazy">
                <span class="card-tag">Merchant listing</span>
                ${discount ? `<span class="discount-tag">${discount}% off</span>` : ""}
            </div>
            <div class="card-body">
                <div><h3>${escapeHtml(product.name)}</h3><p class="product-category">${escapeHtml(category)}</p><p>${escapeHtml(product.uom || "Unit")}</p><p class="product-stock-status ${inStock ? "in-stock" : "out-of-stock"}">${inStock ? `${stock} available` : "Out of stock"}</p></div>
                <div class="price-line"><strong class="price">${money(effectivePrice(product))}</strong>
                    ${discount ? `<s>${money(product.price)}</s>` : ""}
                </div>
            </div>
            <button type="button" data-add-product="${escapeHtml(product.id)}" ${inStock ? "" : "disabled"}>${inStock ? "Add to cart" : "Out of stock"}<span>→</span></button>
        </article>`;
        }).join("") : `<div class="store-empty"><h3>No matching products</h3>
            <p>Try another product name or category.</p></div>`;
    };
    productFilters.addEventListener("submit", event => {
        event.preventDefault();
        renderProducts();
    });
    categoryFilter.addEventListener("change", renderProducts);
    renderProducts();
    productList.addEventListener("click", event => {
        const button = event.target.closest("[data-add-product]");
        if (button) addProductToCart(button.dataset.addProduct);
    });
    if (products.length > 1) startCarousel();
} catch (error) {
    console.error("Could not load the merchant product catalog.", error);
    productCount.textContent = "Catalog unavailable";
    productList.innerHTML = `<div class="store-empty"><h3>Catalog unavailable</h3>
        <p>Merchant products could not be loaded. Check your connection and product read permissions.</p></div>`;
}
