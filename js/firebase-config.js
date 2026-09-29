import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCwf7ffY1yMpW2I7dQzVgZaaGuhrzfZ8Bs",
    authDomain: "tribes-c55f4.firebaseapp.com",
    projectId: "tribes-c55f4",
    storageBucket: "tribes-c55f4.firebasestorage.app",
    messagingSenderId: "288668931924",
    appId: "1:288668931924:web:e060873a10efc7a70a5ac1",
    measurementId: "G-Y3CJQ8L7JC"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);