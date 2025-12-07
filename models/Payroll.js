const mongoose = require('mongoose');

const PayrollSchema = new mongoose.Schema({
    month: { type: String, required: true },
    date: { type: Date, default: Date.now },
    
    details: [{
        employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        employeeCode: { type: String }, // 👇 الحقل الجديد المهم جداً للـ VLOOKUP
        employeeName: { type: String },
        totalSalary: { type: Number },
        
        // تفاصيل الخصومات
        absenceDays: { type: Number, default: 0 },
        absenceValue: { type: Number, default: 0 },
        
        penaltyDays: { type: Number, default: 0 },
        penaltyValue: { type: Number, default: 0 },
        
        latenessDays: { type: Number, default: 0 },
        latenessValue: { type: Number, default: 0 },
        
        sickLeaveDays: { type: Number, default: 0 },
        annualLeaveDays: { type: Number, default: 0 },
        
        monthlyLoan: { type: Number, default: 0 },
        permanentLoan: { type: Number, default: 0 },
        
        totalDeductions: { type: Number, default: 0 },
        netSalary: { type: Number, default: 0 }
    }],

    totalAmount: { type: Number, required: true },
    status: { type: String, default: 'Posted' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Payroll || mongoose.model('Payroll', PayrollSchema);