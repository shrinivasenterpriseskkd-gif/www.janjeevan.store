import { sendPasswordResetEmail, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const form = document.getElementById('customer-login-form');
const statusBox = document.getElementById('customer-status');
const resetForm = document.getElementById('customer-password-reset-form');
const showResetButton = document.getElementById('show-reset');
const cancelResetButton = document.getElementById('cancel-reset');

showResetButton.addEventListener('click', () => {
    resetForm.hidden = false;
    showResetButton.hidden = true;
    statusBox.textContent = '';
    statusBox.className = 'status-message';
});

cancelResetButton.addEventListener('click', () => {
    resetForm.reset();
    resetForm.hidden = true;
    showResetButton.hidden = false;
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const email = document.getElementById('customer-email').value.trim();
    const password = document.getElementById('customer-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('Customer sign-in failed.', error);
        statusBox.textContent = error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found'
            ? 'Email or password is incorrect.'
            : `Sign in failed${error.code ? ` (${error.code})` : ''}. Check your connection and try again.`;
        statusBox.className = 'status-message error';
        return;
    }

    localStorage.removeItem('tribesCurrentCustomer');
    window.location.href = 'customer-portal.html';
});

resetForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!resetForm.reportValidity()) return;

    const email = document.getElementById('customer-reset-email').value.trim();
    try {
        await sendPasswordResetEmail(auth, email);
        resetForm.reset();
        resetForm.hidden = true;
        showResetButton.hidden = false;
        statusBox.textContent = 'If the address belongs to a customer account, Firebase will send a password reset link.';
        statusBox.className = 'status-message success';
    } catch (error) {
        console.error('Could not send customer password reset email.', error);
        statusBox.textContent = `Password reset could not be sent${error.code ? ` (${error.code})` : ''}. Check the email address and try again.`;
        statusBox.className = 'status-message error';
    }
});
