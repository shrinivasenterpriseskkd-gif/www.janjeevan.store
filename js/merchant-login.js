import { sendPasswordResetEmail, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

try {
    const savedMerchants = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
    if (Array.isArray(savedMerchants) && savedMerchants.some(merchant => Object.hasOwn(merchant, 'password'))) {
        localStorage.setItem('tribesMerchants', JSON.stringify(savedMerchants.map(({ password, ...merchant }) => merchant)));
    }
} catch (error) {
    console.warn('Could not remove legacy merchant passwords from this browser.', error);
}

const form = document.getElementById('merchant-login-form');
const statusBox = document.getElementById('status');
const resetForm = document.getElementById('password-reset-form');
const showResetButton = document.getElementById('show-reset');
const cancelResetButton = document.getElementById('cancel-reset');
const showStatus = (message, type) => {
    statusBox.textContent = message;
    statusBox.className = `status-message ${type}`;
};

const bindPasswordToggle = () => {
    document.querySelectorAll('.password-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            button.textContent = isPassword ? '🙈' : '👁';
            button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    });
};

bindPasswordToggle();

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

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('Merchant sign-in failed.', error);
        showStatus(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found'
            ? 'Email or password is incorrect.'
            : `Sign in failed${error.code ? ` (${error.code})` : ''}. Check your connection and try again.`, 'error');
        return;
    }

    showStatus('Sign in successful. Redirecting to your dashboard...', 'success');
    window.setTimeout(() => {
        window.location.href = 'merchant-portal.html';
    }, 800);
});

resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!resetForm.checkValidity()) {
        resetForm.reportValidity();
        return;
    }

    const resetEmail = document.getElementById('resetEmail').value.trim().toLowerCase();
    try {
        await sendPasswordResetEmail(auth, resetEmail);
    } catch (error) {
        console.error('Could not send merchant password reset email.', error);
        showStatus(`Password reset could not be sent${error.code ? ` (${error.code})` : ''}. Check the email address and try again.`, 'error');
        return;
    }

    resetForm.reset();
    resetForm.hidden = true;
    showResetButton.hidden = false;
    showStatus('If the address belongs to a merchant account, Firebase will send a password reset link.', 'success');
});
