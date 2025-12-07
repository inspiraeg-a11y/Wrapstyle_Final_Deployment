const mongoose = require('mongoose');

const CarSchema = new mongoose.Schema({
    // البيانات الأساسية (بنفس أسمائك)
    code: { type: String, required: true, unique: true }, 
    brand: { type: String, required: true }, 
    model: { type: String, required: true }, 
    year: { type: String }, 
    
    // تفاصيل القطع (بنفس مسميات معادلاتك: CM و CM2)
    parts: [{
        name: { type: String, required: true }, 
        lengthCM: { type: Number, default: 0 }, 
        widthCM: { type: Number, default: 0 }, 
        areaCM2: { type: Number, default: 0 }   
    }],

    // الإضافة الوحيدة (تاريخ التسجيل - لا يؤثر على الحسابات)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Car || mongoose.model('Car', CarSchema);