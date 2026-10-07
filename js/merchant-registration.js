import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

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

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
});

const compressShopPhoto = async (file) => {
    const image = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to prepare the shop photo for display.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.78);
    } finally {
        image.close();
    }
};

const collectRegistrationData = () => ({
    merchantId: '',
    fullName: document.getElementById('fullName').value.trim(),
    phoneNo: document.getElementById('phoneNo').value.trim(),
    email: document.getElementById('email').value.trim(),
    gstNumber: document.getElementById('gstNumber').value.trim().toUpperCase(),
    shopCategory: document.getElementById('shopCategory').value,
    panNumber: document.getElementById('panNumber').value.trim().toUpperCase(),
    state: document.getElementById('state').value.trim(),
    language: document.getElementById('language').value.trim(),
    aadharNumber: document.getElementById('aadharNumber').value.trim()
});

const collectRegistrationFee = async (registration) => {
    if (!apiBase || typeof window.Razorpay !== 'function') {
        throw new Error('Secure registration-fee checkout is unavailable. Start the local server and try again.');
    }

    const orderResponse = await fetch(`${apiBase}/api/merchant-registration-order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
        },
        body: JSON.stringify({ merchantId: registration.merchantId })
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order.error || 'Could not start the registration-fee checkout.');
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
                try {
                    const verificationResponse = await fetch(`${apiBase}/api/payments/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
                        },
                        body: JSON.stringify(payment)
                    });
                    if (!verificationResponse.ok) throw new Error('Registration-fee payment verification failed.');
                    resolve();
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
    let firebaseUser;
    let accountSaved = false;

    const fullName = document.getElementById('fullName').value.trim();
    const phoneNo = document.getElementById('phoneNo').value.trim();
    const email = document.getElementById('email').value.trim();
    const address = document.getElementById('address').value.trim();
    const state = document.getElementById('state').value.trim();
    const language = document.getElementById('language').value.trim();
    const aadharNumber = document.getElementById('aadharNumber').value.trim();
    const panPhoto = document.getElementById('panPhoto').files[0];
    const merchantPhoto = document.getElementById('merchantPhoto').files[0];
    const aadharPhoto = document.getElementById('aadharPhoto').files[0];
    const shopPhoto = document.getElementById('shopPhoto').files[0];

    if (!/^\d{12}$/.test(aadharNumber)) {
        showStatus('Aadhar number must contain exactly 12 digits.', 'error');
        return;
    }

    const panNumber = panNumberInput.value.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
        showStatus('Enter a valid 10-character PAN number (5 letters, 4 digits, and 1 letter).', 'error');
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
        if (!/^\d{10}$/.test(registration.phoneNo)) {
            showStatus('Phone number must contain exactly 10 digits.', 'error');
            return;
        }
        registration.merchantId = generateMerchantId();
        const password = generatePassword();
        registration.shopPhotoDataUrl = await compressShopPhoto(shopPhoto);

        firebaseUser = (await createUserWithEmailAndPassword(auth, registration.email, password)).user;
        showStatus('Opening secure one-time ₹1 registration-fee checkout...', 'pending');
        await collectRegistrationFee(registration);

        const createdAt = new Date().toISOString();
        await setDoc(doc(db, 'merchantAccounts', firebaseUser.uid), {
            merchantId: registration.merchantId,
            fullName: registration.fullName,
            email: firebaseUser.email || registration.email,
            phoneNo: registration.phoneNo,
            gstNumber: registration.gstNumber,
            shopCategory: registration.shopCategory,
            state: registration.state,
            language: registration.language,
            createdAt: serverTimestamp()
        });
        const merchantId = registration.merchantId;
        savedCredentials = { merchantId, password };
        accountSaved = true;
        showMerchantCredentials(merchantId, password);

        const merchantStore = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
        if (!Array.isArray(merchantStore)) throw new Error('Saved merchant registrations are not in a valid list format.');
        merchantStore.push({
            merchantId,
            fullName: registration.fullName,
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

        const [merchantPhotoData, aadharPhotoData, panPhotoData, shopPhotoData] = await Promise.all([
            readAsDataURL(merchantPhoto),
            readAsDataURL(aadharPhoto),
            compressShopPhoto(panPhoto),
            readAsDataURL(shopPhoto)
        ]);

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
        showStatus('Registration completed. Save your Merchant ID and password below; the password is not stored in the Admin dashboard.', 'success');
    } catch (error) {
        console.error(error);
        if (firebaseUser && !accountSaved) {
            try {
                await deleteUser(firebaseUser);
            } catch (cleanupError) {
                console.error('Could not remove the incomplete merchant account.', cleanupError);
            }
        }
        if (savedCredentials) {
            showMerchantCredentials(savedCredentials.merchantId, savedCredentials.password);
            showStatus(`Your registration was saved, but the registration PDF could not be completed. Your login details are shown below. ${error.message || ''}`, 'error');
            return;
        }
        if (error.code === 'auth/email-already-in-use') {
            showStatus('This email already has an account. Use Merchant Sign In or the password reset option. If registration was interrupted before you received your Merchant ID, contact support at comtribes@gmail.com.', 'error');
            return;
        }
        showStatus(error.message || 'Registration could not be completed. Please try again.', 'error');
    }
});
