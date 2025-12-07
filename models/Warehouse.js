const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema({
    name: { type: String, required: true }, // اسم المخزن (مثلاً: مخزن أكتوبر)
    code: { type: String, unique: true },   // كود المخزن (مثلاً: WH-01)
    
    // الأب (عشان الشجرة)
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    
    // المسار الكامل (للسهولة في البحث: مخزن أكتوبر > رولات > رول 30)
    path: { type: String },

    // ربط بحساب مالي (اختياري، لو عايز تفصل حساب مخزون لكل فرع)
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Warehouse || mongoose.model('Warehouse', WarehouseSchema);