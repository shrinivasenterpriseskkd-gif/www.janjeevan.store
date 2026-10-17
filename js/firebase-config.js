import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCEFDTn0rfzCnLp62MEK6_O9eO1gnBu2zg",
    authDomain: "janjeevanstore.firebaseapp.com",
    projectId: "janjeevanstore",
    messagingSenderId: "538298630866",
    appId: "1:538298630866:web:a763a858f073bdac5c630b",
    measurementId: "G-YWXWM7R6KS"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = isAnalyticsSupported()
    .then(supported => supported ? getAnalytics(app) : null)
    .catch(error => {
        console.warn('Firebase Analytics is unavailable.', error);
        return null;
    });