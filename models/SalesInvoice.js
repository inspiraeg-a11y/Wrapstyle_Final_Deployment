const mongoose = require('mongoose');

// مخطط تفاصيل الصنف
const SalesItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String },
    partName: { type: String }, // اسم القطعة (كبوت/سقف)
    
    lengthCM: { type: Number, default: 0 },
    widthCM: { type: Number, default: 0 },
    area: { type: Number, default: 0 },
    
    price: { type: Number, default: 0 }, // سعر البيع
    recordedCost: { type: Number, default: 0 } // تكلفة الصنف (للربحية)
});

// المخطط الرئيسي للفاتورة
const SalesInvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'Posted' },
    
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    carModel: { type: mongoose.Schema.Types.ObjectId, ref: 'Car' },
    serviceType: { type: String },
    
    items: [SalesItemSchema],
    
    // --- الحسابات المالية (الجديد) ---
    subtotal: { type: Number, default: 0 }, // إجمالي الأصناف
    totalExtraCosts: { type: Number, default: 0 }, // مصاريف إضافية (نقل/تركيب)
    
    totalDiscount: { type: Number, default: 0 }, // خصم مسموح به
    
    totalTax: { type: Number, default: 0 }, // ضريبة قيمة مضافة (14%)
    whtAmount: { type: Number, default: 0 }, // ضريبة خصم من المنبع (تضاف للأصول)
    
    finalTotal: { type: Number, default: 0 }, // الصافي المستحق على العميل

    notes: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.SalesInvoice || mongoose.model('SalesInvoice', SalesInvoiceSchema);