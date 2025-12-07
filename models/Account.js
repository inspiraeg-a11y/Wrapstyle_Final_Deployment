const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true }, // كود الحساب (1101)
    name: { type: String, required: true }, // اسم الحساب
    
    type: { 
        type: String, 
        required: true,
        enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] 
    },

    parentId: { type: String, default: null }, // كود الأب (للتجميع)
    
    // هل الحساب فرعي يقبل قيود؟ (True = فرعي، False = رئيسي)
    isTransactional: { type: Boolean, default: true }, 

    nature: { 
        type: String, 
        required: true,
        enum: ['Debit', 'Credit'] 
    },
    
    financialStatement: { 
        type: String, 
        enum: ['BalanceSheet', 'IncomeStatement'], 
        default: 'BalanceSheet'
    },

    currentBalance: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Account || mongoose.model('Account', AccountSchema);