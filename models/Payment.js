const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true }, // المبلغ المدفوع
    paymentMethod: { type: String, enum: ['Cash', 'Bank'], default: 'Cash' }, // كاش ولا بنك
    
    type: { type: String, enum: ['Inbound', 'Outbound'], required: true }, // قبض (داخل) ولا صرف (خارج)
    
    // بنربط الدفع بالفاتورة (سواء بيع أو شراء)
    invoiceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invoiceType: { type: String, enum: ['Sales', 'Purchase'], required: true }, // نوع الفاتورة
    
    // الحساب المالي اللي الفلوس دخلت فيه (الخزنة أو البنك)
    treasuryAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },

    note: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);