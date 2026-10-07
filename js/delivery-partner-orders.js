import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import {
    getCurrentLocation,
    calculateDeliveryPartnerPayout,
    isActiveOrder,
    readOrders,
    renderOrderMap,
    subscribeToOrders,
    updateOrders
} from './order-tracking.js';

const apiBase = (window.TRIBES_API_BASE_URL || '').replace(/\/$/, '');
let currentPartner;
const orderList = document.getElementById('orders-list');
const ordersStatus = document.getElementById('orders-status');
const partnerLocationStatus = document.getElementById('partner-location-status');
const shareLocationButton = document.getElementById('share-partner-location');
let partnerWatchId = null;
let partnerSharing = false;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[character]);
}

function setPartnerPhoto(photo) {
    const partnerPhoto = document.getElementById('partner-photo');
    partnerPhoto.hidden = !photo;
    partnerPhoto.src = photo || '';
    document.getElementById('partner-photo-initials').textContent = photo
        ? ''
        : currentPartner.fullName.split(/\s+/).map(name => name[0]).slice(0, 2).join('').toUpperCase();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The photo could not be read.'));
        reader.readAsDataURL(file);
    });
}

async function compressProfilePhoto(file) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        throw new Error('Choose a JPEG or PNG photo.');
    }

    const image = new Image();
    image.src = await readFileAsDataUrl(file);
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('The selected photo is not a valid image.'));
    });

    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser cannot process this photo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
}

function renderOrders() {
    let orders;
    try {
        orders = readOrders();
    } catch (error) {
        console.error('Could not read Delivery Partner orders.', error);
        ordersStatus.textContent = 'Orders could not be loaded. Please refresh or contact support.';
        return;
    }

    const assignedOrders = orders;
    if (!assignedOrders.some(isActiveOrder) && partnerWatchId !== null) {
        partnerSharing = false;
        navigator.geolocation.clearWatch(partnerWatchId);
        partnerWatchId = null;
        partnerLocationStatus.textContent = 'Location sharing stopped because you have no active orders.';
        shareLocationButton.textContent = 'Share my location';
    }
    if (!assignedOrders.length) {
        orderList.innerHTML = '<div class="delivery-orders-empty"><h2>No orders yet</h2><p>Orders assigned to your delivery area will appear here.</p></div>';
        return;
    }

    orderList.innerHTML = assignedOrders.slice().reverse().map(order => {
        const payout = order.deliveryPartnerPayout || calculateDeliveryPartnerPayout(order);
        return `
        <article class="delivery-order-card" data-order-id="${escapeHtml(order.id)}">
            <div class="delivery-order-header">
                <div><p>Order</p><h2>${escapeHtml(order.orderId)}</h2></div>
                <span class="delivery-order-status">${escapeHtml(order.status)}</span>
            </div>
            <div class="delivery-order-meta">
                <span>Delivery state: <strong>${escapeHtml(order.deliveryState)}</strong></span>
                <span>Placed: <strong>${escapeHtml(new Date(order.createdAt).toLocaleString('en-IN'))}</strong></span>
                <span>Total: <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.amount || 0))}</strong></span>
            </div>
            <div class="delivery-order-meta delivery-partner-payout">
                <span>Partner payout: <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payout.total))}</strong></span>
                <span>Base: <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payout.basePay))}</strong></span>
                <span>Distance: <strong>${escapeHtml(`${payout.distanceKm} km · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payout.distancePay)}`)}</strong></span>
                ${payout.longTripPay ? `<span>Long trip: <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payout.longTripPay))}</strong></span>` : ''}
                ${payout.dailyBonus ? `<span>Daily bonus: <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payout.dailyBonus))}</strong></span>` : ''}
            </div>
            <ul class="delivery-order-items">
                ${(Array.isArray(order.items) ? order.items : []).map(item => `<li>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</li>`).join('')}
            </ul>
            ${isActiveOrder(order) ? `<div class="order-tracking-actions"><button class="button secondary" type="button" data-order-action="${order.status === 'Out for delivery' ? 'delivered' : 'start'}">${order.status === 'Out for delivery' ? 'Mark delivered' : 'Start delivery'}</button><span>Order status and GPS updates sync with authorized participants.</span></div>` : ''}
            ${renderOrderMap(order)}
        </article>
    `;
    }).join('');
}

async function stopPartnerSharing(clearLocations) {
    partnerSharing = false;
    if (partnerWatchId !== null) {
        navigator.geolocation.clearWatch(partnerWatchId);
        partnerWatchId = null;
    }
    shareLocationButton.textContent = 'Share my location';
    if (clearLocations) {
        try {
            await updateOrders(orders => orders.forEach(order => {
                if (order.assignedPartnerUid === currentPartner.uid && isActiveOrder(order)) {
                    delete order.deliveryPartnerLocation;
                }
            }));
        } catch (error) {
            console.error('Could not stop sharing Delivery Partner GPS locations.', error);
            ordersStatus.textContent = 'Location sharing stopped, but the saved location could not be cleared. Please refresh and try again.';
        }
    }
}

function startPartnerSharing() {
    if (!navigator.geolocation) {
        partnerLocationStatus.textContent = 'This browser does not support location sharing.';
        return;
    }

    let activeOrders;
    try {
        activeOrders = readOrders().filter(isActiveOrder);
    } catch (error) {
        console.error('Could not load assigned orders before starting GPS sharing.', error);
        ordersStatus.textContent = 'Orders could not be loaded. Refresh and try again.';
        return;
    }
    if (!activeOrders.length) {
        partnerLocationStatus.textContent = 'There are no active assigned orders to track.';
        return;
    }

    partnerLocationStatus.textContent = 'Waiting for location permission...';
    partnerSharing = true;
    partnerWatchId = navigator.geolocation.watchPosition(async position => {
        if (!partnerSharing) return;
        try {
            const location = getCurrentLocation(position);
            await updateOrders(orders => orders.forEach(order => {
                if (order.assignedPartnerUid === currentPartner.uid && isActiveOrder(order)) {
                    order.deliveryPartnerLocation = location;
                }
            }));
            partnerLocationStatus.textContent = `Live location is shared with the Customer and Admin (accuracy about ${location.accuracy} m).`;
            renderOrders();
        } catch (error) {
            console.error('Could not update the shared Delivery Partner GPS location.', error);
            ordersStatus.textContent = 'Your latest location could not be synced to the order.';
        }
    }, error => {
        partnerSharing = false;
        if (partnerWatchId !== null) navigator.geolocation.clearWatch(partnerWatchId);
        partnerWatchId = null;
        partnerLocationStatus.textContent = error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location access and try again.'
            : 'Could not get your location. Check device location settings and try again.';
        console.error('Could not watch the Delivery Partner GPS location.', error);
        shareLocationButton.textContent = 'Share my location';
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    shareLocationButton.textContent = 'Stop sharing location';
}

orderList.addEventListener('click', async event => {
    const button = event.target.closest('[data-order-action]');
    if (!button) return;

    try {
        const orderId = button.closest('.delivery-order-card')?.dataset.orderId;
        const status = button.dataset.orderAction === 'delivered' ? 'Delivered' : 'Out for delivery';
        const response = await fetch(`${apiBase}/api/orders/${encodeURIComponent(orderId)}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
            },
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not update this order.');
        ordersStatus.textContent = status === 'Delivered'
            ? 'Order marked delivered. Shared GPS points were cleared.'
            : 'Delivery started. Your location can now be shared with the Customer and Admin.';
        ordersStatus.className = 'delivery-orders-status success';
    } catch (error) {
        console.error('Could not update the assigned order status.', error);
        ordersStatus.textContent = error.message;
    }
});

shareLocationButton.addEventListener('click', async () => {
    if (!currentPartner) return;
    if (partnerWatchId !== null) {
        await stopPartnerSharing(true);
        partnerLocationStatus.textContent = 'Live location sharing stopped and your saved GPS points were cleared.';
        renderOrders();
    } else startPartnerSharing();
});

document.getElementById('sign-out').addEventListener('click', async () => {
    await stopPartnerSharing(true);
    await signOut(auth);
    window.location.replace('Delivery Partner-login.html');
});
window.addEventListener('pagehide', () => { void stopPartnerSharing(true); }, { once: true });

let unsubscribeOrders;
onAuthStateChanged(auth, async user => {
    if (unsubscribeOrders) unsubscribeOrders();
    if (!user) {
        window.location.replace('Delivery Partner-login.html');
        return;
    }
    try {
        const profile = await getDoc(doc(db, 'deliveryPartnerAccounts', user.uid));
        if (!profile.exists()) {
            await signOut(auth);
            window.location.replace('Delivery Partner-login.html');
            return;
        }
        currentPartner = { ...profile.data(), uid: user.uid };
        document.getElementById('partner-name').textContent = `${currentPartner.fullName} · ${currentPartner.deliveryPartnerId}`;
        setPartnerPhoto(currentPartner.profilePhoto || '');
        unsubscribeOrders = subscribeToOrders(renderOrders, { role: 'deliveryPartner' });
        renderOrders();
    } catch (error) {
        console.error('Could not load the signed-in Delivery Partner profile.', error);
        ordersStatus.textContent = 'Your Delivery Partner profile could not be loaded. Check Firebase permissions and try again.';
    }
});

document.getElementById('profile-photo-upload').addEventListener('change', async event => {
    const [file] = event.target.files;
    if (!file) return;

    try {
        const profilePhoto = await compressProfilePhoto(file);
        if (!currentPartner?.uid) throw new Error('Sign in before changing your profile photo.');
        await updateDoc(doc(db, 'deliveryPartnerAccounts', currentPartner.uid), { profilePhoto });
        currentPartner.profilePhoto = profilePhoto;
        setPartnerPhoto(profilePhoto);
        ordersStatus.textContent = 'Profile photo updated and synced to your account.';
    } catch (error) {
        console.error('Could not update Delivery Partner profile photo.', error);
        ordersStatus.textContent = `Profile photo could not be updated: ${error.message}`;
    } finally {
        event.target.value = '';
    }
});
