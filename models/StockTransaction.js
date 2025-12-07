const mongoose = require('mongoose');

const StockTransactionSchema = new mongoose.Schema({
    serialNumber: { type: String, required: true }, // رقم الإذن (TRX-...)
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['Inbound', 'Outbound'], required: true }, // نوع الحركة

    // 👇 الحقل المهم لمنع تكرار الفاتورة
    supplierDoc: { type: String }, 

    // بيانات إضافية
    carName: { type: String }, 
    jobOrder: { type: String }, 
    warehouse: { type: String, default: 'المخزن الرئيسي' },
    receiverName: { type: String }, // اسم المستلم
    technicianName: { type: String }, // اسم الفني (في الصرف)
    transactionReason: { type: String },
    notes: { type: String },

    // جدول الأصناف
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        rollCode: { type: String }, // كود الرول (مهم جداً)
        
        // بيانات الصرف
        partName: { type: String },
        consumedLength: { type: Number },
        consumedWidth: { type: Number },
        consumedArea: { type: Number },

        // بيانات الاستلام
        quantity: { type: Number },
        customDimensions: { 
            length: { type: Number }, 
            width: { type: Number } 
        }
    }],

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.StockTransaction || mongoose.model('StockTransaction', StockTransactionSchema);