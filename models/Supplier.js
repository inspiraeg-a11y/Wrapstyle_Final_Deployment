const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
    code: { type: String, unique: true }, 
    name: { type: String, required: true },
    phone: { type: String, required: true },
    
    companyName: { type: String },
    taxId: { type: String }, 
    address: { type: String },
    
    // 👇 الربط بالحساب المالي
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);