const form = document.getElementById('merchant-form');
const statusBox = document.getElementById('status');
const donationInput = document.getElementById('donation');
const apiBase = (window.TRIBES_API_BASE_URL || '').replace(/\/$/, '');

const getStoredMerchantIds = () => new Set(JSON.parse(localStorage.getItem('tribesMerchants') || '[]').map(merchant => merchant.merchantId));

const generateMerchantId = () => {
    const existingIds = getStoredMerchantIds();
    let merchantId;
    do {
        merchantId = `TRIBES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
previewImage('shopPhoto', 'shopPreview');

const showStatus = (message, type) => {
    statusBox.textContent = message;
    statusBox.className = `status-message ${type}`;
};

const downloadCredentialsCsv = (merchantId, password) => {
    const escapeCsv = value => `"${String(value).replace(/"/g, '""')}"`;
    const csv = [
        ['Merchant ID', 'Password'],
        [merchantId, password]
    ].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tribes-merchant-credentials-${merchantId}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
});

const collectRegistrationData = () => ({
    merchantId: '',
    password: '',
    fullName: document.getElementById('fullName').value.trim(),
    phoneNo: document.getElementById('phoneNo').value.trim(),
    email: document.getElementById('email').value.trim(),
    state: document.getElementById('state').value.trim(),
    language: document.getElementById('language').value.trim(),
    aadharNumber: document.getElementById('aadharNumber').value.trim()
});

const collectDonationPayment = async (registration) => {
    if (!donationInput.checked) return;
    if (!apiBase || typeof window.Razorpay !== 'function') {
        throw new Error('Secure donation checkout is unavailable. Start the local server and try again.');
    }

    const orderResponse = await fetch(`${apiBase}/api/merchant-registration-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: registration.merchantId })
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order.error || 'Could not start the donation checkout.');

    await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: 'TRIBES',
            description: '₹1 community donation with merchant registration',
            order_id: order.orderId,
            prefill: { name: registration.fullName, email: registration.email, contact: registration.phoneNo },
            theme: { color: '#ef6b3f' },
            handler: async payment => {
                try {
                    const verificationResponse = await fetch(`${apiBase}/api/payments/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payment)
                    });
                    if (!verificationResponse.ok) throw new Error('Donation verification failed.');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        });
        checkout.on('payment.failed', failure => reject(new Error(failure.error?.description || 'Donation payment failed.')));
        checkout.open();
    });
};

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const fullName = document.getElementById('fullName').value.trim();
    const phoneNo = document.getElementById('phoneNo').value.trim();
    const email = document.getElementById('email').value.trim();
    const address = document.getElementById('address').value.trim();
    const state = document.getElementById('state').value.trim();
    const language = document.getElementById('language').value.trim();
    const aadharNumber = document.getElementById('aadharNumber').value.trim();
    const merchantPhoto = document.getElementById('merchantPhoto').files[0];
    const aadharPhoto = document.getElementById('aadharPhoto').files[0];
    const shopPhoto = document.getElementById('shopPhoto').files[0];

    if (!merchantPhoto || !aadharPhoto || !shopPhoto) {
        showStatus('Please upload merchant, Aadhar, and shop photos.', 'error');
        return;
    }

    try {
        const registration = collectRegistrationData();
        if (!/^\d{10}$/.test(registration.phoneNo)) {
            showStatus('Phone number must contain exactly 10 digits.', 'error');
            return;
        }
        registration.merchantId = generateMerchantId();
        if (donationInput.checked) showStatus('Opening secure ₹1 donation checkout...', 'pending');
        await collectDonationPayment(registration);

        const merchantId = registration.merchantId;
        const password = generatePassword();
        registration.password = password;

        const merchantStore = JSON.parse(localStorage.getItem('tribesMerchants') || '[]');
        merchantStore.push({
            ...registration,
            createdAt: new Date().toISOString()
        });
        localStorage.setItem('tribesMerchants', JSON.stringify(merchantStore));

        showStatus('Generating your TRIBES registration PDF...', 'pending');

        const [merchantPhotoData, aadharPhotoData, shopPhotoData] = await Promise.all([
            readAsDataURL(merchantPhoto),
            readAsDataURL(aadharPhoto),
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
        doc.text('TRIBES Merchant Registration', 14, 22);

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

        try {
            doc.addImage(merchantPhotoData, 'JPEG', 14, y, 45, 45);
            doc.addImage(aadharPhotoData, 'JPEG', 105, y, 45, 45);
            y += 52;
            doc.addImage(shopPhotoData, 'JPEG', 14, y, 45, 45);
            y += 52;
        } catch (imageError) {
            console.warn('Image embedding warning:', imageError);
            doc.text('Uploaded images attached to the registration form.', 14, y);
            y += 12;
        }

        doc.setFont('helvetica', 'bold');
        doc.text('TRIBES Terms & Conditions', 14, y + 6);
        y += 16;

        doc.setFont('helvetica', 'normal');
        const terms = [
            '1. The merchant confirms that the provided information is true and accurate.',
            '2. TRIBES may verify identity and address details before approving merchant onboarding.',
            '3. The merchant agrees to maintain honest product and pricing information.',
            '4. TRIBES reserves the right to suspend or reject registration if the terms are violated.',
            '5. By signing this registration, the merchant accepts the TRIBES policies and rules.'
        ];

        terms.forEach((term) => {
            const wrapped = doc.splitTextToSize(term, 180);
            doc.text(wrapped, 14, y);
            y += wrapped.length * 7 + 4;
        });

        doc.setFont('helvetica', 'bold');
        doc.text('Authorized Signature: _______________________   Date: _______________________', 14, 270);

        doc.save('TRIBES-Merchant-Registration.pdf');
        downloadCredentialsCsv(merchantId, password);
        form.reset();
        donationInput.checked = true;
        document.getElementById('merchantPreview').hidden = true;
        document.getElementById('aadharPreview').hidden = true;
        document.getElementById('shopPreview').hidden = true;
        showStatus(`Registration completed. Your Merchant ID and password were downloaded as a CSV. Store the file securely.`, 'success');
    } catch (error) {
        console.error(error);
        showStatus(error.message || 'Registration could not be completed. Please try again.', 'error');
    }
});
