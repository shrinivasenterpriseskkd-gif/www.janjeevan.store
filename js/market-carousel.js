import { andhraPradeshMarketPhotos } from './market-photos.js';

const carousel = document.querySelector('#hero-market-carousel');
const image = document.querySelector('#hero-market-photo');
const caption = document.querySelector('#hero-market-caption');
const credit = document.querySelector('#hero-market-credit');
const count = document.querySelector('#hero-market-count');
const previous = document.querySelector('#hero-market-previous');
const next = document.querySelector('#hero-market-next');

let activeIndex = 0;
let timer;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
andhraPradeshMarketPhotos.forEach(photo => {
    const preload = new Image();
    preload.src = photo.src;
});

function showPhoto(index) {
    activeIndex = (index + andhraPradeshMarketPhotos.length) % andhraPradeshMarketPhotos.length;
    const photo = andhraPradeshMarketPhotos[activeIndex];
    image.classList.add('is-changing');
    image.src = photo.src;
    image.alt = photo.alt;
    caption.textContent = photo.caption;
    credit.href = photo.fileUrl;
    credit.textContent = `${photo.artist} · ${photo.license}`;
    credit.setAttribute('aria-label', `Photo by ${photo.artist}, ${photo.license}; view source`);
    count.textContent = `${activeIndex + 1} / ${andhraPradeshMarketPhotos.length}`;
    image.onload = () => image.classList.remove('is-changing');
    image.onerror = () => {
        image.classList.remove('is-changing');
        console.error(`Could not load the Andhra Pradesh market photo: ${photo.fileUrl}`);
    };
}

function stopAutoplay() {
    window.clearInterval(timer);
}

function startAutoplay() {
    stopAutoplay();
    if (reducedMotion.matches || document.hidden) return;
    timer = window.setInterval(() => showPhoto(activeIndex + 1), 5000);
}

previous.addEventListener('click', () => {
    showPhoto(activeIndex - 1);
    startAutoplay();
});
next.addEventListener('click', () => {
    showPhoto(activeIndex + 1);
    startAutoplay();
});
carousel.addEventListener('mouseenter', stopAutoplay);
carousel.addEventListener('mouseleave', startAutoplay);
carousel.addEventListener('focusin', stopAutoplay);
carousel.addEventListener('focusout', event => {
    if (!carousel.contains(event.relatedTarget)) startAutoplay();
});
document.addEventListener('visibilitychange', startAutoplay);
reducedMotion.addEventListener('change', startAutoplay);

showPhoto(0);
startAutoplay();
