import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const form = document.getElementById('customer-registration-form');
const statusBox = document.getElementById('customer-status');
const dateOfBirthInput = document.getElementById('customer-date-of-birth');
const today = new Date();
dateOfBirthInput.max = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
].join('-');

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const name = document.getElementById('customer-name').value.trim();
    const dateOfBirth = dateOfBirthInput.value;
    const mobile = document.getElementById('customer-mobile').value.trim();
    const email = document.getElementById('customer-email').value.trim().toLowerCase();
    const state = document.getElementById('customer-state').value;
    const password = document.getElementById('customer-password').value;
    const confirmPassword = document.getElementById('customer-confirm-password').value;

    if (new Date(`${dateOfBirth}T00:00:00`) > new Date()) {
        statusBox.textContent = 'Date of birth cannot be in the future.';
        statusBox.className = 'status-message error';
        return;
    }
    if (!/^\d{10}$/.test(mobile)) {
        statusBox.textContent = 'Mobile number must contain exactly 10 digits.';
        statusBox.className = 'status-message error';
        return;
    }
    if (password !== confirmPassword) {
        statusBox.textContent = 'Passwords do not match.';
        statusBox.className = 'status-message error';
        return;
    }

    let user;
    try {
        user = (await createUserWithEmailAndPassword(auth, email, password)).user;
        await setDoc(doc(db, 'customerAccounts', user.uid), {
            role: 'customer',
            name,
            dateOfBirth,
            mobile,
            email: user.email || email,
            state,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Could not create the Firebase customer account.', error);
        if (user) {
            try {
                await deleteUser(user);
            } catch (cleanupError) {
                console.error('Could not remove the incomplete customer account.', cleanupError);
            }
        }
        statusBox.textContent = error.code === 'auth/email-already-in-use'
            ? 'An account already exists for this email. Sign in or reset your password.'
            : error.code === 'permission-denied'
                ? 'Firestore denied the profile write. Publish the project rules, then try again.'
                : `Account creation failed${error.code ? ` (${error.code})` : ''}. Check your connection and try again.`;
        statusBox.className = 'status-message error';
        return;
    }

    localStorage.removeItem('tribesCurrentCustomer');
    window.location.href = 'customer-portal.html';
});
