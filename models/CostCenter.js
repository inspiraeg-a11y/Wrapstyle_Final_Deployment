const mongoose = require('mongoose');

const CostCenterSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true }, // كود المركز (مثل: 101)
    name: { type: String, required: true },               // اسم المركز (مثل: فرع التجمع)
    type: { type: String, enum: ['Production', 'Sales', 'Admin'], default: 'Admin' }, // نوعه
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.CostCenter || mongoose.model('CostCenter', CostCenterSchema);