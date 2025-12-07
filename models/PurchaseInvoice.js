const mongoose = require('mongoose');

const PurchaseInvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true },
    date: { type: Date, default: Date.now },
    documentType: { type: String, enum: ['Invoice', 'Order'], default: 'Invoice' }, 
    
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        cost: { type: Number, required: true },
        lineTotal: { type: Number }
    }],
    
    extraCosts: [{
        description: { type: String }, 
        amount: { type: Number }
    }],
    
    subtotal: { type: Number },
    totalAmount: { type: Number },
    
    status: { type: String, enum: ['Paid', 'Unpaid'], default: 'Unpaid' },
    notes: { type: String },
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.PurchaseInvoice || mongoose.model('PurchaseInvoice', PurchaseInvoiceSchema);