const mongoose = require('mongoose');

const TreasuryTransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    serialNumber: { type: String, required: true }, // سيريال خاص (مثال: CASH-MAIN-IN-001)
    type: { type: String, enum: ['Inbound', 'Outbound'], required: true },
    
    amount: { type: Number, required: true },
    
    // الخزنة أو البنك (الطرف الثابت)
    treasuryAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    
    // الطرف الآخر (العميل/المورد/المصروف)
    targetAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    targetName: { type: String }, // للتوضيح في الطباعة

    // تفاصيل الدفع
    paymentMethod: { type: String, enum: ['Cash', 'BankTransfer', 'Check', 'POS'], default: 'Cash' },
    
    // تفاصيل البنك والشيكات
    bankName: { type: String },      // اسم البنك المسحوب عليه
    checkNumber: { type: String },   // رقم الشيك / التحويل
    dueDate: { type: Date },         // تاريخ استحقاق الشيك
    
    description: { type: String },
    
    // التوقيعات (نصية للحفظ فقط، التوقيع الفعلي عالورق)
    signatures: {
        preparedBy: { type: String },
        reviewedBy: { type: String },
        receivedBy: { type: String }
    },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.TreasuryTransaction || mongoose.model('TreasuryTransaction', TreasuryTransactionSchema);