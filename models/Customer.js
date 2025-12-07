const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
    code: { type: String, unique: true }, 
    name: { type: String, required: true },
    phone: { type: String, required: true },
    nationalId: { type: String }, 
    email: { type: String },
    
    isTaxable: { type: Boolean, default: false },
    companyName: { type: String },
    taxId: { type: String }, 
    address: { type: String },
    
    // 👇 السطر ده هو اللي بيخلينا نعرف نعمل القيد على حساب العميل
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

    currentBalance: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);