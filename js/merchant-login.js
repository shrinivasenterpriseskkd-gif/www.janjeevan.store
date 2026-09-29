const form = document.getElementById('merchant-login-form');
const statusBox = document.getElementById('status');
const resetForm = document.getElementById('password-reset-form');
const showResetButton = document.getElementById('show-reset');
const cancelResetButton = document.getElementById('cancel-reset');
const hasSpecialCharacter = value => /[^A-Za-z0-9]/.test(value);

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

form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const merchantId = document.getElementById('merchantId').value.trim();
    const password = document.getElementById('password').value.trim();
    const merchants = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
    const merchant = merchants.find((entry) => entry.merchantId === merchantId && entry.password === password);

    if (!merchant) {
        showStatus('Invalid merchant ID or password. Please try again.', 'error');
        return;
    }

    localStorage.setItem('tribesCurrentMerchant', JSON.stringify({
        merchantId: merchant.merchantId,
        fullName: merchant.fullName,
        phoneNo: merchant.phoneNo,
        createdAt: merchant.createdAt
    }));

    showStatus('Sign in successful. Redirecting to your dashboard...', 'success');
    window.setTimeout(() => {
        window.location.href = 'admin/index.html';
    }, 800);
});

resetForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!resetForm.checkValidity()) {
        resetForm.reportValidity();
        return;
    }

    const resetMerchantId = document.getElementById('resetMerchantId').value.trim();
    const resetEmail = document.getElementById('resetEmail').value.trim().toLowerCase();
    const resetPassword = document.getElementById('resetPassword').value;
    const resetConfirmPassword = document.getElementById('resetConfirmPassword').value;
    const merchants = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
    const merchantIndex = merchants.findIndex(merchant => merchant.merchantId === resetMerchantId && merchant.email?.toLowerCase() === resetEmail);

    if (merchantIndex === -1) {
        showStatus('Merchant ID and registered email do not match.', 'error');
        return;
    }

    if (resetPassword !== resetConfirmPassword) {
        showStatus('New passwords do not match.', 'error');
        return;
    }

    if (!hasSpecialCharacter(resetPassword)) {
        showStatus('New password must include at least one special character.', 'error');
        return;
    }

    merchants[merchantIndex].password = resetPassword;
    localStorage.setItem('tribesMerchants', JSON.stringify(merchants));
    resetForm.reset();
    resetForm.hidden = true;
    showResetButton.hidden = false;
    showStatus('Password reset successfully. You can now sign in.', 'success');
});
