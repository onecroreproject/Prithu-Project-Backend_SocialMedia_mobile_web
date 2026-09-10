// be/utils/invoiceGenerator.js
const PDFDocument = require('pdfkit');
const path = require('path');

/**
 * Generate Invoice PDF buffer
 * @param {Object} data - { userName, email, invoiceNumber, paymentDate, planName, amount, razorpayPaymentId }
 * @returns {Promise<Buffer>}
 */
const generateInvoicePDF = (data) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        let chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        // --- Branding ---
        const logoPath = path.join(__dirname, 'prithu.png');
        try {
            doc.image(logoPath, 50, 45, { width: 50 });
        } catch (e) {
            // Fallback if logo missing
            doc.fontSize(20).text('PRITHU', 50, 50);
        }

        doc.fillColor('#064d3b')
            .fontSize(25)
            .font('Helvetica-Bold')
            .text('PRITHU', 110, 57);

        doc.fontSize(10)
            .font('Helvetica')
            .fillColor('#444')
            .text('Invoice / Payment Receipt', 50, 110, { align: 'right' });

        // --- Horizontal Line ---
        doc.moveTo(50, 125).lineTo(550, 125).strokeColor('#e0e5dd').stroke();

        // --- Invoice Header Details ---
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#064d3b').text('Billed To:', 50, 150);
        doc.fontSize(10).font('Helvetica').fillColor('#000').text(data.userName, 50, 165);
        doc.text(data.email, 50, 178);

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#064d3b').text('Invoice Details:', 350, 150);
        doc.fontSize(10).font('Helvetica').fillColor('#000').text(`Invoice #: ${data.invoiceNumber}`, 350, 165);
        doc.text(`Date: ${data.paymentDate}`, 350, 178);
        if (data.razorpayPaymentId) {
            doc.text(`RID: ${data.razorpayPaymentId}`, 350, 191);
        }

        // --- Table Header ---
        const tableTop = 230;
        doc.rect(50, tableTop, 500, 25).fill('#f9f9f7');
        doc.fillColor('#064d3b').font('Helvetica-Bold').fontSize(10);
        doc.text('Description', 60, tableTop + 8);
        doc.text('Amount', 450, tableTop + 8, { width: 90, align: 'right' });

        // --- Table Body ---
        doc.fillColor('#000').font('Helvetica').fontSize(11);
        doc.text(`Subscription Plan: ${data.planName}`, 60, tableTop + 40);
        doc.fontSize(14).font('Helvetica-Bold').text(`INR ${data.amount}.00`, 420, tableTop + 40, { width: 120, align: 'right' });

        // --- Total ---
        doc.moveTo(50, tableTop + 70).lineTo(550, tableTop + 70).strokeColor('#e0e5dd').stroke();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#064d3b').text('Total Amount Paid', 60, tableTop + 85);
        doc.fontSize(16).text(`INR ${data.amount}.00`, 420, tableTop + 85, { width: 120, align: 'right' });

        // --- Note ---
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#5a6b5f').text('Thank you for choosing Prithu. This is a computer-generated invoice and does not require a signature.', 50, 400, { align: 'center', width: 500 });

        // --- Footer ---
        doc.fontSize(9).font('Helvetica').fillColor('#999').text('© 2026 Prithu. All rights reserved.', 50, 700, { align: 'center', width: 500 });

        doc.end();
    });
};

module.exports = { generateInvoicePDF };
