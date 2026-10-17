const viewport = document.querySelector("#service-carousel-window");
const track = document.querySelector("#service-carousel-track");
const count = document.querySelector("#service-count");
const previous = document.querySelector("#previous-service");
const next = document.querySelector("#next-service");

if (viewport && track && count && previous && next) {
    const cards = [...track.children];
    const cardCount = cards.length;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    let loopResetTimer;

    count.textContent = `${cardCount} service${cardCount === 1 ? "" : "s"}`;
    cards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        clone.querySelectorAll("a").forEach(link => link.setAttribute("tabindex", "-1"));
        track.append(clone);
    });

    const getStep = () => {
        const firstCard = track.firstElementChild;
        const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
        return firstCard ? firstCard.getBoundingClientRect().width + gap : 0;
    };

    const move = direction => {
        if (cardCount < 2) return;
        const step = getStep();
        if (!step) return;
        let currentIndex = Math.round(viewport.scrollLeft / step);

        if (direction < 0 && currentIndex <= 0) {
            viewport.scrollTo({ left: cardCount * step, behavior: "auto" });
            currentIndex = cardCount;
        }

        const targetIndex = currentIndex + direction;
        if (direction > 0 && targetIndex >= cardCount) {
            viewport.scrollTo({ left: cardCount * step, behavior: reducedMotion.matches ? "auto" : "smooth" });
            window.clearTimeout(loopResetTimer);
            loopResetTimer = window.setTimeout(() => {
                if (viewport.scrollLeft >= cardCount * step - 2) {
                    viewport.scrollTo({ left: 0, behavior: "auto" });
                }
            }, reducedMotion.matches ? 0 : 600);
            return;
        }

        viewport.scrollTo({
            left: Math.max(0, targetIndex) * step,
            behavior: reducedMotion.matches ? "auto" : "smooth"
        });
    };

    const stop = () => window.clearInterval(timer);
    const start = () => {
        stop();
        if (cardCount < 2 || reducedMotion.matches || document.hidden) return;
        timer = window.setInterval(() => move(1), 5000);
    };

    previous.addEventListener("click", () => { move(-1); start(); });
    next.addEventListener("click", () => { move(1); start(); });
    viewport.addEventListener("mouseenter", stop);
    viewport.addEventListener("mouseleave", start);
    viewport.addEventListener("focusin", stop);
    viewport.addEventListener("focusout", event => {
        if (!viewport.contains(event.relatedTarget)) start();
    });
    document.addEventListener("visibilitychange", start);
    reducedMotion.addEventListener("change", start);
    start();
}