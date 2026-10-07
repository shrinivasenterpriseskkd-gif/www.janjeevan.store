import { collection, deleteField, doc, onSnapshot, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

let ordersCache = [];
let orderRole;

export function readOrders() {
    return structuredClone(ordersCache);
}

export function subscribeToOrders(callback, { role } = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('Firebase sign-in is required to read orders.');
    if (!['customer', 'deliveryPartner'].includes(role)) throw new Error('An order participant role is required.');

    orderRole = role;
    const field = role === 'customer' ? 'customerUid' : 'assignedPartnerUid';
    const ordersQuery = query(collection(db, 'orders'), where(field, '==', user.uid));
    return onSnapshot(ordersQuery, snapshot => {
        ordersCache = snapshot.docs.map(orderDocument => {
            const order = orderDocument.data();
            const timestampFields = ['createdAt', 'pickedUpAt', 'deliveredAt'];
            timestampFields.forEach(fieldName => {
                const value = order[fieldName]?.toDate?.() || order[fieldName];
                if (value instanceof Date) order[fieldName] = value.toISOString();
            });
            return { ...order, id: orderDocument.id };
        });
        callback(ordersCache);
    }, error => {
        console.error('Could not subscribe to Firestore orders.', error);
    });
}

export async function updateOrders(updater) {
    if (!auth.currentUser || !orderRole) throw new Error('Sign in and load your orders before updating them.');

    const previous = ordersCache;
    const next = structuredClone(previous);
    updater(next);
    const allowedFields = orderRole === 'customer'
        ? ['customerLiveLocation']
        : ['deliveryPartnerLocation'];
    const writes = [];

    next.forEach((order, index) => {
        const before = previous[index];
        if (!before || before.id !== order.id) throw new Error('Order records cannot be added or replaced from a participant page.');
        const changedKeys = new Set([...Object.keys(before), ...Object.keys(order)]);
        const changes = {};
        changedKeys.forEach(key => {
            if (JSON.stringify(before[key]) === JSON.stringify(order[key])) return;
            if (!allowedFields.includes(key)) throw new Error(`Participants cannot update the ${key} field.`);
            changes[key] = Object.hasOwn(order, key) ? order[key] : deleteField();
        });
        if (Object.keys(changes).length) writes.push(updateDoc(doc(db, 'orders', order.id), changes));
    });

    await Promise.all(writes);
    ordersCache = next;
    return readOrders();
}

export function isActiveOrder(order) {
    return !['Delivered', 'Cancelled'].includes(order.status);
}

export function hasLocation(location) {
    return location
        && Number.isFinite(Number(location.latitude))
        && Number.isFinite(Number(location.longitude))
        && Math.abs(Number(location.latitude)) <= 90
        && Math.abs(Number(location.longitude)) <= 180;
}

export function getCurrentLocation(position) {
    return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
        updatedAt: new Date().toISOString()
    };
}

const payoutPolicy = {
    baseRadiusKm: 3,
    basePay: 30,
    distanceRate: 6,
    longTripThresholdKm: 10,
    longTripPay: 70
};

const toRadians = degrees => Number(degrees) * Math.PI / 180;

function distanceBetween(first, second) {
    if (!hasLocation(first) || !hasLocation(second)) return 0;
    const latitudeDelta = toRadians(second.latitude - first.latitude);
    const longitudeDelta = toRadians(second.longitude - first.longitude);
    const latitudeOne = toRadians(first.latitude);
    const latitudeTwo = toRadians(second.latitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitudeOne) * Math.cos(latitudeTwo);
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function calculateDeliveryDistance(order) {
    const merchants = Array.isArray(order.merchantLocations) ? order.merchantLocations : [];
    const merchant = merchants.find(hasLocation) || order.merchantLocation;
    return Math.round(distanceBetween(merchant, order.customerLocation) * 10) / 10;
}

export function getDailyBonus(completedOrderCount) {
    if (completedOrderCount >= 30) return 2000;
    if (completedOrderCount >= 20) return 1200;
    if (completedOrderCount >= 10) return 500;
    return 0;
}

export function calculateDeliveryPartnerPayout(order, dailyBonus = 0) {
    const distanceKm = calculateDeliveryDistance(order);
    const longTrip = distanceKm >= payoutPolicy.longTripThresholdKm;
    const distancePay = longTrip
        ? 0
        : Math.max(0, Math.ceil(distanceKm - payoutPolicy.baseRadiusKm)) * payoutPolicy.distanceRate;
    const basePay = longTrip ? 0 : payoutPolicy.basePay;
    const longTripPay = longTrip ? payoutPolicy.longTripPay : 0;

    return {
        basePay,
        distanceKm,
        distancePay,
        longTripPay,
        dailyBonus,
        total: basePay + distancePay + longTripPay + dailyBonus
    };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
})[character]);

export function renderOrderMap(order) {
    if (!isActiveOrder(order)) {
        return '<div class="delivery-map-unavailable">Order completed; live GPS sharing has stopped.</div>';
    }

    const merchantLocations = hasLocation(order.merchantLocation)
        ? [order.merchantLocation]
        : Array.isArray(order.merchantLocations)
            ? order.merchantLocations
            : [];
    const merchants = merchantLocations
        .filter(location => hasLocation(location))
        .map(location => ({
            kind: 'merchant',
            label: location.label || 'Merchant pickup',
            latitude: Number(location.latitude),
            longitude: Number(location.longitude)
        }));
    const customerLocation = hasLocation(order.customerLiveLocation)
        ? { ...order.customerLiveLocation, label: 'Customer live location' }
        : hasLocation(order.customerLocation)
            ? { ...order.customerLocation, label: 'Customer delivery pin' }
            : null;

    const points = [
        ...merchants,
        ...(hasLocation(order.deliveryPartnerLocation) ? [{
            kind: 'partner',
            label: 'Delivery Partner',
            latitude: Number(order.deliveryPartnerLocation.latitude),
            longitude: Number(order.deliveryPartnerLocation.longitude)
        }] : []),
        ...(customerLocation ? [{
            kind: 'customer',
            label: customerLocation.label,
            latitude: Number(customerLocation.latitude),
            longitude: Number(customerLocation.longitude)
        }] : [])
    ];
    if (!points.length) {
        return '<div class="delivery-map-unavailable">Location sharing is off. Shared GPS points will appear here while this order is active.</div>';
    }

    const minLatitude = Math.min(...points.map(point => point.latitude));
    const maxLatitude = Math.max(...points.map(point => point.latitude));
    const minLongitude = Math.min(...points.map(point => point.longitude));
    const maxLongitude = Math.max(...points.map(point => point.longitude));
    const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.01);
    const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.01);
    const project = point => ({
        x: 65 + ((point.longitude - minLongitude) / longitudeSpan) * 550,
        y: 225 - ((point.latitude - minLatitude) / latitudeSpan) * 165
    });
    const projected = points.map(point => ({ ...point, ...project(point) }));
    const partner = projected.find(point => point.kind === 'partner');
    const customer = projected.find(point => point.kind === 'customer');
    const merchantPoints = projected.filter(point => point.kind === 'merchant');
    const routePairs = partner
        ? [
            ...merchantPoints.map(merchant => [merchant, partner]),
            ...(customer ? [[partner, customer]] : [])
        ]
        : merchantPoints.length && customer
            ? [[merchantPoints[0], customer]]
            : [];
    const safeId = String(order.orderId || 'order').replace(/[^A-Za-z0-9_-]/g, '');
    const markers = projected.map(point => {
        const color = point.kind === 'merchant' ? '#8b5cf6' : point.kind === 'partner' ? '#247653' : '#e66e45';
        return `<circle cx="${point.x}" cy="${point.y}" r="12" fill="${color}" stroke="#fff" stroke-width="4"/><text x="${point.x + 15}" y="${point.y - 10}" class="map-label">${escapeHtml(point.label)}</text>`;
    }).join('');
    const routes = routePairs.map(([from, to]) =>
        `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#e66e45" stroke-width="4" stroke-dasharray="9 7"/>`
    ).join('');
    const updatedLocations = [
        order.merchantLocation,
        order.deliveryPartnerLocation,
        order.customerLiveLocation || order.customerLocation
    ].filter(location => hasLocation(location) && Number.isFinite(Date.parse(location.updatedAt)));
    const lastUpdated = updatedLocations.length
        ? `Last location update: ${escapeHtml(new Date(Math.max(...updatedLocations.map(location => Date.parse(location.updatedAt)))).toLocaleTimeString('en-IN'))}.`
        : '';

    return `
        <div class="delivery-map-wrap">
            <svg class="delivery-route-map" viewBox="0 0 680 270" role="img" aria-label="Order route map showing shared Merchant pickup, Delivery Partner, and Customer locations">
                <defs>
                    <pattern id="map-grid-${safeId}" width="34" height="34" patternUnits="userSpaceOnUse">
                        <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#dce8df" stroke-width="1"/>
                    </pattern>
                </defs>
                <rect x="0" y="0" width="680" height="270" rx="14" fill="#f1f7f1"/>
                <rect x="12" y="12" width="656" height="246" rx="10" fill="url(#map-grid-${safeId})"/>
                ${routes}
                ${markers}
                <text x="22" y="246" class="map-distance">${lastUpdated}</text>
            </svg>
            <p class="delivery-map-note">Route is a straight-line preview, not road navigation. GPS is shared only with the customer, assigned Delivery Partner, and Admin while the order is active.</p>
        </div>
    `;
}
