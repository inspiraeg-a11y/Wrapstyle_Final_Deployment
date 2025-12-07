const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    nationalId: { type: String },
    insuranceId: { type: String }, // الرقم التأميني
    department: { type: String },
    jobTitle: { type: String },
    hireDate: { type: Date },
    
    vacationBalance: { type: Number, default: 21 }, // رصيد الإجازات (الافتراضي 21)

    // تفاصيل الراتب
    basicSalary: { type: Number, default: 0 }, // أساسي
    variableSalary: { type: Number, default: 0 }, // متغير
    insuranceSalary: { type: Number, default: 0 }, // الأجر التأميني (أساسي + متغير)

    transportAllowance: { type: Number, default: 0 }, // بدل انتقال
    otherAllowance: { type: Number, default: 0 }, // بدلات أخرى
    incentives: { type: Number, default: 0 }, // حوافز

    totalSalary: { type: Number, default: 0 }, // إجمالي الراتب (الشامل)
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);