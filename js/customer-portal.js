import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import {
    getCurrentLocation,
    isActiveOrder,
    readOrders,
    renderOrderMap,
    subscribeToOrders,
    updateOrders
} from './order-tracking.js';

let currentCustomer;
const orderList = document.getElementById('customer-orders-list');
const orderStatus = document.getElementById('customer-orders-status');
let customerWatchId = null;
let customerSharing = false;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[character]);
}

function renderOrders() {
    let orders;
    try {
        orders = readOrders();
    } catch (error) {
        console.error('Could not load customer order history.', error);
        orderStatus.textContent = 'Your order history could not be loaded. Please refresh or contact support.';
        orderStatus.className = 'status-message error';
        return;
    }

    const customerOrders = orders;
    if (!customerOrders.some(isActiveOrder) && customerWatchId !== null) {
        customerSharing = false;
        navigator.geolocation.clearWatch(customerWatchId);
        customerWatchId = null;
        orderStatus.textContent = 'Live location sharing stopped because you have no active orders.';
    }
    if (!customerOrders.length) {
        orderList.innerHTML = '<div class="customer-empty-orders"><h3>No orders yet</h3><p>Orders placed while signed in will appear here.</p><a href="index.html">Browse the shop</a></div>';
        return;
    }

    orderList.innerHTML = customerOrders.slice().reverse().map(order => `
        <article class="customer-order-card">
            <div><span>Order</span><h3>${escapeHtml(order.orderId)}</h3></div>
            <span class="customer-order-status">${escapeHtml(order.status)}</span>
            <p>${escapeHtml(order.deliveryState)} · ${escapeHtml(new Date(order.createdAt).toLocaleDateString('en-IN'))}</p>
            <ul>${(Array.isArray(order.items) ? order.items : []).map(item => `<li>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</li>`).join('')}</ul>
            <strong>${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.amount || 0))}</strong>
            ${isActiveOrder(order) ? `<div class="order-tracking-actions"><button class="button secondary" type="button" data-location-action="${customerWatchId === null ? 'start' : 'stop'}">${customerWatchId === null ? 'Share live location' : 'Stop sharing location'}</button><span>Sharing is optional and ends when you stop it or the order is delivered.</span></div>` : ''}
            ${renderOrderMap(order)}
        </article>
    `).join('');
}

async function stopCustomerSharing(clearLocations) {
    customerSharing = false;
    if (customerWatchId !== null) {
        navigator.geolocation.clearWatch(customerWatchId);
        customerWatchId = null;
    }
    if (clearLocations) {
        try {
            await updateOrders(orders => orders.forEach(order => {
                if (order.customerUid === auth.currentUser?.uid && isActiveOrder(order)) {
                    delete order.customerLiveLocation;
                }
            }));
        } catch (error) {
            console.error('Could not stop sharing Customer GPS locations.', error);
            orderStatus.textContent = 'Location sharing stopped, but the saved location could not be cleared. Please refresh and try again.';
            orderStatus.className = 'status-message error';
        }
    }
}

function startCustomerSharing() {
    if (!navigator.geolocation) {
        orderStatus.textContent = 'This browser does not support location sharing.';
        orderStatus.className = 'status-message error';
        return;
    }

    let activeOrders;
    try {
        activeOrders = readOrders().filter(order =>
            order.customerMobile === currentCustomer.mobile && isActiveOrder(order)
        );
    } catch (error) {
        console.error('Could not load orders before starting Customer GPS sharing.', error);
        orderStatus.textContent = 'Your orders could not be loaded. Refresh and try again.';
        orderStatus.className = 'status-message error';
        return;
    }
    if (!activeOrders.length) return;

    orderStatus.textContent = 'Waiting for location permission...';
    orderStatus.className = 'status-message';
    customerSharing = true;
    customerWatchId = navigator.geolocation.watchPosition(async position => {
        if (!customerSharing) return;
        try {
            const location = getCurrentLocation(position);
            await updateOrders(orders => orders.forEach(order => {
                if (order.customerUid === auth.currentUser?.uid && isActiveOrder(order)) {
                    order.customerLiveLocation = location;
                }
            }));
            orderStatus.textContent = `Live location is shared for your active orders (accuracy about ${location.accuracy} m).`;
            orderStatus.className = 'status-message success';
            renderOrders();
        } catch (error) {
            console.error('Could not update the shared Customer GPS location.', error);
            orderStatus.textContent = 'Your latest location could not be synced to the order.';
            orderStatus.className = 'status-message error';
        }
    }, error => {
        customerSharing = false;
        if (customerWatchId !== null) navigator.geolocation.clearWatch(customerWatchId);
        customerWatchId = null;
        orderStatus.textContent = error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location access and try again.'
            : 'Could not get your location. Check device location settings and try again.';
        orderStatus.className = 'status-message error';
        console.error('Could not watch the Customer GPS location.', error);
        renderOrders();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    renderOrders();
}

orderList.addEventListener('click', async event => {
    const button = event.target.closest('[data-location-action]');
    if (!button) return;
    if (button.dataset.locationAction === 'start') startCustomerSharing();
    else {
        await stopCustomerSharing(true);
        orderStatus.textContent = 'Live location sharing stopped and the saved Customer GPS point was cleared.';
        orderStatus.className = 'status-message';
        renderOrders();
    }
});

document.getElementById('customer-sign-out').addEventListener('click', async () => {
    await stopCustomerSharing(true);
    await signOut(auth);
    window.location.replace('customer-login.html');
});

let unsubscribeOrders;
onAuthStateChanged(auth, async user => {
    if (unsubscribeOrders) unsubscribeOrders();
    if (!user) {
        window.location.replace('customer-login.html');
        return;
    }

    try {
        const profile = await getDoc(doc(db, 'customerAccounts', user.uid));
        if (!profile.exists()) {
            await signOut(auth);
            window.location.replace('customer-login.html');
            return;
        }
        currentCustomer = profile.data();
        document.getElementById('portal-customer-name').textContent = currentCustomer.name;
        document.getElementById('portal-customer-dob').textContent = new Date(`${currentCustomer.dateOfBirth}T00:00:00`)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('portal-customer-mobile').textContent = currentCustomer.mobile;
        document.getElementById('portal-customer-email').textContent = currentCustomer.email || 'Not provided';
        document.getElementById('portal-customer-state').textContent = currentCustomer.state || 'Not provided';
        unsubscribeOrders = subscribeToOrders(renderOrders, { role: 'customer' });
        renderOrders();
        window.addEventListener('pagehide', () => { void stopCustomerSharing(true); }, { once: true });
    } catch (error) {
        console.error('Could not load the signed-in customer profile.', error);
        orderStatus.textContent = 'Your customer profile could not be loaded. Check Firebase permissions and try again.';
        orderStatus.className = 'status-message error';
    }
});
