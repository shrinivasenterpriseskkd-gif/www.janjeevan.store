const form = document.getElementById('merchant-form');
const statusBox = document.getElementById('status');

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

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const fullName = document.getElementById('fullName').value.trim();
    const phoneNo = document.getElementById('phoneNo').value.trim();
    const address = document.getElementById('address').value.trim();
    const aadharNumber = document.getElementById('aadharNumber').value.trim();
    const merchantPhoto = document.getElementById('merchantPhoto').files[0];
    const aadharPhoto = document.getElementById('aadharPhoto').files[0];

    if (!merchantPhoto || !aadharPhoto) {
        showStatus('Please upload both merchant and Aadhar photos.', 'error');
        return;
    }

    try {
        showStatus('Generating your TRIBES registration PDF...', 'pending');

        const [merchantPhotoData, aadharPhotoData] = await Promise.all([
            readAsDataURL(merchantPhoto),
            readAsDataURL(aadharPhoto)
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
            `Full Name: ${fullName}`,
            `Phone No: ${phoneNo}`,
            `Address: ${address}`,
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
        form.reset();
        document.getElementById('merchantPreview').hidden = true;
        document.getElementById('aadharPreview').hidden = true;
        showStatus('Registration completed successfully. The TRIBES PDF has been downloaded.', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Something went wrong while creating the PDF. Please try again.', 'error');
    }
});
