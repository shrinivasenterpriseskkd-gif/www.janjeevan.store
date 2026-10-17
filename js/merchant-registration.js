import {
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    deleteUser,
    setPersistence
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { normalizePaymentLink } from "./payment-link.js";

const form = document.getElementById('merchant-form');
const statusBox = document.getElementById('status');
const credentialsPanel = document.getElementById('merchant-registration-credentials');
const registrationFeeConsent = document.getElementById('registration-fee-consent');
const aadharInput = document.getElementById('aadharNumber');
const panNumberInput = document.getElementById('panNumber');
const gstNumberInput = document.getElementById('gstNumber');
const apiBase = (window.TRIBES_API_BASE_URL || '').replace(/\/$/, '');

const showMerchantCredentials = (merchantId, password) => {
    document.getElementById('registration-merchant-id').textContent = merchantId;
    document.getElementById('registration-merchant-password').textContent = password;
    credentialsPanel.hidden = false;
    credentialsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

aadharInput.addEventListener('input', () => {
    aadharInput.value = aadharInput.value.replace(/\D/g, '').slice(0, 12);
});

panNumberInput.addEventListener('input', () => {
    panNumberInput.value = panNumberInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
});

document.getElementById('bankAccountNumber').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 18);
});

document.getElementById('ifscCode').addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
});

gstNumberInput.addEventListener('input', () => {
    gstNumberInput.value = gstNumberInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
});

const getStoredMerchantIds = () => new Set(JSON.parse(localStorage.getItem('tribesMerchants') || '[]').map(merchant => merchant.merchantId));

const generateMerchantId = () => {
    const existingIds = getStoredMerchantIds();
    let merchantId;
    do {
        merchantId = `Janjeevan.store-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    } while (existingIds.has(merchantId));
    return merchantId;
};

const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const specialChars = '!@#$%';
    const password = [specialChars[Math.floor(Math.random() * specialChars.length)]];
    while (password.length < 10) password.push(chars[Math.floor(Math.random() * chars.length)]);
    return password.sort(() => Math.random() - 0.5).join('');
};

const previewImage = (inputId, previewId) => {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) {
            preview.hidden = true;
            preview.src = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            preview.src = event.target.result;
            preview.hidden = false;
        };
        reader.readAsDataURL(file);
    });
};

previewImage('merchantPhoto', 'merchantPreview');
previewImage('aadharPhoto', 'aadharPreview');
previewImage('panPhoto', 'panPreview');
previewImage('shopPhoto', 'shopPreview');

const showStatus = (message, type) => {
    statusBox.textContent = message;
    statusBox.className = `status-message ${type}`;
};

const requestRegistrationApi = async (url, options, action) => {
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new Error(`Could not connect to the secure merchant ${action} service. Please try again later or contact comtribes@gmail.com.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        if (response.status === 404 || contentType.toLowerCase().includes('text/html')) {
            throw new Error(`The secure merchant ${action} service is not available on this website yet. Please contact comtribes@gmail.com.`);
        }
        throw new Error(`The merchant ${action} service returned an unexpected response (HTTP ${response.status}). Please try again later.`);
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`The merchant ${action} service returned an invalid response. Please try again later.`);
    }

    if (!response.ok) {
        throw new Error(result.error || `Could not complete merchant ${action}.`);
    }
    return result;
};

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
});

const compressShopPhoto = async (file) => {
    const image = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 700 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to prepare the shop photo for display.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.72, 0.64, 0.56, 0.48, 0.4]) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= 400000) return dataUrl;
        }
        throw new Error('The compressed shop photo is too large to save. Choose a smaller or simpler photo.');
    } finally {
        image.close();
    }
};

const collectRegistrationData = () => ({
    merchantId: '',
    fullName: document.getElementById('fullName').value.trim(),
    shopName: document.getElementById('shopName').value.trim(),
    phoneNo: document.getElementById('phoneNo').value.trim(),
    email: document.getElementById('email').value.trim(),
    gstNumber: document.getElementById('gstNumber').value.trim().toUpperCase(),
    shopCategory: document.getElementById('shopCategory').value,
    state: document.getElementById('state').value.trim(),
    language: document.getElementById('language').value.trim(),
    bankAccountNumber: document.getElementById('bankAccountNumber').value.trim(),
    ifscCode: document.getElementById('ifscCode').value.trim().toUpperCase(),
    upiLink: document.getElementById('upiLink').value.trim()
});

const collectRegistrationFee = async (registration, onPaymentSubmitted) => {
    if (!apiBase || typeof window.Razorpay !== 'function') {
        throw new Error('Secure registration-fee checkout is unavailable. Start the local server and try again.');
    }

    const order = await requestRegistrationApi(`${apiBase}/api/merchant-registration-order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
        },
        body: JSON.stringify({
            merchantId: registration.merchantId,
            profile: {
                merchantId: registration.merchantId,
                fullName: registration.fullName,
                shopName: registration.shopName,
                phoneNo: registration.phoneNo,
                email: registration.email,
                gstNumber: registration.gstNumber,
                shopCategory: registration.shopCategory,
                state: registration.state,
                language: registration.language,
                bankAccountNumber: registration.bankAccountNumber,
                ifscCode: registration.ifscCode,
                upiLink: registration.upiLink,
                shopPhotoDataUrl: registration.shopPhotoDataUrl
            }
        })
    }, 'registration-fee checkout');
    if (order.amount !== 100 || order.currency !== 'INR') {
        throw new Error('The registration checkout returned an unexpected fee. No payment was started.');
    }

    await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: 'Janjeevan.store',
            description: 'One-time ₹1 merchant registration fee (no recurring charge)',
            order_id: order.orderId,
            prefill: { name: registration.fullName, email: registration.email, contact: registration.phoneNo },
            theme: { color: '#ef6b3f' },
            modal: {
                ondismiss: () => reject(new Error('Registration-fee payment was cancelled. No registration was completed.'))
            },
            handler: async payment => {
                onPaymentSubmitted();
                try {
                    const verification = await requestRegistrationApi(`${apiBase}/api/payments/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
                        },
                        body: JSON.stringify(payment)
                    }, 'payment verification');
                    if (!verification.registrationFee) {
                        throw new Error('Payment was verified, but the merchant profile was not confirmed. Do not pay again; contact comtribes@gmail.com.');
                    }
                    resolve(verification);
                } catch (error) {
                    reject(error);
                }
            }
        });
        checkout.on('payment.failed', failure => reject(new Error(failure.error?.description || 'Registration-fee payment failed.')));
        checkout.open();
    });
};

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    credentialsPanel.hidden = true;
    statusBox.textContent = '';
    statusBox.className = 'status-message';

    if (window.location.protocol === 'file:') {
        showStatus('This page is opened as a file:// URL, so the separate Merchant Login page may not be able to access its saved account. Start the site with npm start, then open http://localhost:5500/merchant-registration.html and register there.', 'error');
        return;
    }

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (!registrationFeeConsent.checked) {
        showStatus('Agree to the one-time ₹1 registration fee before continuing.', 'error');
        registrationFeeConsent.focus();
        return;
    }

    let savedCredentials = null;
    let pendingCredentials = null;
    let firebaseUser;
    let accountSaved = false;
    let paymentCompleted = false;

    const fullName = document.getElementById('fullName').value.trim();
    const shopName = document.getElementById('shopName').value.trim();
    const phoneNo = document.getElementById('phoneNo').value.trim();
    const email = document.getElementById('email').value.trim();
    const address = document.getElementById('address').value.trim();
    const state = document.getElementById('state').value.trim();
    const language = document.getElementById('language').value.trim();
    const aadharNumber = document.getElementById('aadharNumber').value.trim();
    const panNumber = panNumberInput.value.trim().toUpperCase();
    const bankAccountNumber = document.getElementById('bankAccountNumber').value.trim();
    const ifscCode = document.getElementById('ifscCode').value.trim().toUpperCase();
    const upiLink = document.getElementById('upiLink').value.trim();
    const normalizedUpiLink = normalizePaymentLink(upiLink);
    const panPhoto = document.getElementById('panPhoto').files[0];
    const merchantPhoto = document.getElementById('merchantPhoto').files[0];
    const aadharPhoto = document.getElementById('aadharPhoto').files[0];
    const shopPhoto = document.getElementById('shopPhoto').files[0];

    if (!/^\d{12}$/.test(aadharNumber)) {
        showStatus('Aadhar number must contain exactly 12 digits.', 'error');
        return;
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
        showStatus('Enter a valid 10-character PAN number (5 letters, 4 digits, and 1 letter).', 'error');
        return;
    }

    if (bankAccountNumber && !/^\d{6,18}$/.test(bankAccountNumber)) {
        showStatus('Bank account number must contain 6–18 digits.', 'error');
        return;
    }
    if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        showStatus('Enter a valid 11-character IFSC code.', 'error');
        return;
    }
    if (normalizedUpiLink === null) {
        showStatus('Enter an HTTPS payment link, UPI link, or UPI ID such as shop@okaxis.', 'error');
        return;
    }

    if (!merchantPhoto || !aadharPhoto || !panPhoto || !shopPhoto) {
        showStatus('Please upload merchant, Aadhar, PAN card, and shop photos.', 'error');
        return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(panPhoto.type) || panPhoto.size > 5 * 1024 * 1024) {
        showStatus('Choose a JPG, PNG, or WebP PAN card photo no larger than 5 MB.', 'error');
        return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(shopPhoto.type) || shopPhoto.size > 5 * 1024 * 1024) {
        showStatus('Choose a JPG, PNG, or WebP shop photo no larger than 5 MB.', 'error');
        return;
    }

    try {
        const registration = collectRegistrationData();
        registration.upiLink = normalizedUpiLink;
        registration.panNumber = panNumber;
        registration.aadharNumber = aadharNumber;
        if (!/^\d{10}$/.test(registration.phoneNo)) {
            showStatus('Phone number must contain exactly 10 digits.', 'error');
            return;
        }
        registration.merchantId = generateMerchantId();
        const password = generatePassword();
        pendingCredentials = { merchantId: registration.merchantId, password };
        registration.shopPhotoDataUrl = await compressShopPhoto(shopPhoto);

        await setPersistence(auth, browserLocalPersistence);
        firebaseUser = (await createUserWithEmailAndPassword(auth, registration.email, password)).user;
        showStatus('Opening secure one-time ₹1 registration-fee checkout...', 'pending');
        await collectRegistrationFee(registration, () => {
            paymentCompleted = true;
            savedCredentials = pendingCredentials;
        });
        accountSaved = true;

        savedCredentials = pendingCredentials;
        showMerchantCredentials(savedCredentials.merchantId, savedCredentials.password);

        const createdAt = new Date().toISOString();
        const merchantId = savedCredentials.merchantId;

        const merchantStore = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
        if (!Array.isArray(merchantStore)) throw new Error('Saved merchant registrations are not in a valid list format.');
        merchantStore.push({
            merchantId,
            fullName: registration.fullName,
            shopName: registration.shopName,
            phoneNo: registration.phoneNo,
            email: registration.email,
            gstNumber: registration.gstNumber,
            shopCategory: registration.shopCategory,
            state: registration.state,
            createdAt,
            shopPhotoDataUrl: registration.shopPhotoDataUrl
        });
        localStorage.setItem('tribesMerchants', JSON.stringify(merchantStore));

        showStatus('Generating your Janjeevan.store registration PDF...', 'pending');

        const [merchantPhotoData, aadharPhotoData, panPhotoData] = await Promise.all([
            readAsDataURL(merchantPhoto),
            readAsDataURL(aadharPhoto),
            compressShopPhoto(panPhoto)
        ]);
        const shopPhotoData = registration.shopPhotoDataUrl;
        let localArchiveNotice = "";
        try {
            const [merchantArchivePhoto, aadhaarArchivePhoto, panArchivePhoto] = await Promise.all([
                compressShopPhoto(merchantPhoto),
                compressShopPhoto(aadharPhoto),
                compressShopPhoto(panPhoto)
            ]);
            const archive = await requestRegistrationApi(`${apiBase}/api/local-archive/merchant`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${await auth.currentUser.getIdToken()}`
                },
                body: JSON.stringify({
                    profile: {
                        merchantId,
                        fullName: registration.fullName,
                        shopName: registration.shopName,
                        email: registration.email,
                        phoneNo: registration.phoneNo,
                        address,
                        gstNumber: registration.gstNumber,
                        shopCategory: registration.shopCategory,
                        state,
                        language,
                        aadhaarNumber,
                        panNumber: registration.panNumber,
                        bankAccountNumber: registration.bankAccountNumber,
                        ifscCode: registration.ifscCode,
                        upiLink: registration.upiLink,
                        createdAt
                    },
                    photos: {
                        merchant: merchantArchivePhoto,
                        aadhaar: aadhaarArchivePhoto,
                        pan: panArchivePhoto,
                        shop: shopPhotoData
                    }
                })
            }, "local profile archive");
            localArchiveNotice = ` Local CSV and photos saved at ${archive.storageDirectory}.`;
        } catch (archiveError) {
            console.error("Merchant registration local archive failed.", archiveError);
            localArchiveNotice = ` Local CSV/photo backup failed: ${archiveError.message || "check server folder permissions"}.`;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('PDF library failed to load.');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFillColor(244, 242, 236);
        doc.rect(0, 0, 210, 297, 'F');

        doc.setTextColor(17, 22, 20);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Janjeevan.store Merchant Registration', 14, 22);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Registration completed successfully', 14, 30);
        doc.text('Date: ' + new Date().toLocaleDateString('en-IN'), 14, 38);

        let y = 52;
        const lines = [
            `Merchant ID: ${merchantId}`,
            `Password: ${password}`,
            `Full Name: ${fullName}`,
            `Shop Name: ${shopName}`,
            `Phone No: ${phoneNo}`,
            `Email: ${email}`,
            `GSTIN: ${registration.gstNumber || 'Not provided'}`,
            `Shop Category: ${registration.shopCategory}`,
            `PAN Number: ${registration.panNumber}`,
            `Address: ${address}`,
            `State: ${state}`,
            `Language: ${language}`,
            `Aadhar Number: ${aadharNumber}`
        ];

        doc.setFont('helvetica', 'bold');
        doc.text('Merchant Details', 14, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        lines.forEach((line) => {
            const wrapped = doc.splitTextToSize(line, 180);
            doc.text(wrapped, 14, y);
            y += wrapped.length * 7 + 4;
        });

        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Merchant and Identity Photos', 14, 22);
        doc.setFontSize(10);
        try {
            doc.text('Merchant photo', 14, 38);
            doc.addImage(merchantPhotoData, 'JPEG', 14, 42, 82, 64);
            doc.text('Aadhar card', 110, 38);
            doc.addImage(aadharPhotoData, 'JPEG', 110, 42, 82, 64);
            doc.text('PAN card', 14, 128);
            doc.addImage(panPhotoData, 'JPEG', 14, 132, 82, 64);
            doc.text('Shop photo', 110, 128);
            doc.addImage(shopPhotoData, 'JPEG', 110, 132, 82, 64);
        } catch (imageError) {
            console.warn('Image embedding warning:', imageError);
            doc.text('One or more uploaded images could not be embedded in the PDF.', 14, 42);
        }

        doc.setFont('helvetica', 'bold');
        doc.addPage();
        y = 32;
        doc.text('Janjeevan.store Terms & Conditions', 14, y + 6);
        y += 16;

        doc.setFont('helvetica', 'normal');
        const terms = [
            '1. The merchant confirms that the provided information is true and accurate.',
            '2. Janjeevan.store may verify identity and address details before approving merchant onboarding.',
            '3. The merchant agrees to maintain honest product and pricing information.',
            '4. Janjeevan.store reserves the right to suspend or reject registration if the terms are violated.',
            '5. By signing this registration, the merchant accepts the Janjeevan.store policies and rules.'
        ];

        terms.forEach((term) => {
            const wrapped = doc.splitTextToSize(term, 180);
            doc.text(wrapped, 14, y);
            y += wrapped.length * 7 + 4;
        });

        doc.setFont('helvetica', 'bold');
        doc.text('Authorized Signature: _______________________   Date: _______________________', 14, 270);

        doc.save('Janjeevan.store-Merchant-Registration.pdf');
        form.reset();
        registrationFeeConsent.checked = false;
        document.getElementById('merchantPreview').hidden = true;
        document.getElementById('aadharPreview').hidden = true;
        document.getElementById('panPreview').hidden = true;
        document.getElementById('shopPreview').hidden = true;
        showStatus(`Registration completed. Save your Merchant ID and password below; the password is not stored in the Admin dashboard.${localArchiveNotice}`, localArchiveNotice.startsWith(" Local CSV and photos saved") ? "success" : "pending");
    } catch (error) {
        console.error(error);
        if (firebaseUser && !accountSaved && !paymentCompleted) {
            try {
                await deleteUser(firebaseUser);
            } catch (cleanupError) {
                console.error('Could not remove the incomplete merchant account.', cleanupError);
            }
        }
        if (savedCredentials) {
            showMerchantCredentials(savedCredentials.merchantId, savedCredentials.password);
            showStatus(accountSaved
                ? `Your registration was saved, but the registration PDF could not be completed. Your login details are shown below. ${error.message || ''}`
                : 'Payment succeeded, but your merchant profile could not be saved. Keep these login details and contact comtribes@gmail.com. Do not pay again.',
                'error');
            return;
        }
        if (error.code === 'auth/email-already-in-use') {
            showStatus('This email already has an account. Use Merchant Sign In or the password reset option. If registration was interrupted before you received your Merchant ID, contact support at comtribes@gmail.com.', 'error');
            return;
        }
        showStatus(`Registration was not completed, so no merchant ID or password was issued. ${error.message || 'Please try again after the registration service is available.'}`, 'error');
    }
});
