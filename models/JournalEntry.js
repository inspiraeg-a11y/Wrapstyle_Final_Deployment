const mongoose = require('mongoose');

const JournalEntrySchema = new mongoose.Schema({
    entryDate: { type: Date, required: true },
    referenceNo: { type: String, required: true, unique: true },
    description: { type: String },
    
    lines: [{
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
        accountName: { type: String },
        
        // 👇👇👇 الربط الجديد: مركز التكلفة 👇👇👇
        costCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' }, 
        
        description: { type: String },
        debit: { type: Number, default: 0 },
        credit: { type: Number, default: 0 }
    }],

    totalDebit: { type: Number, required: true },
    totalCredit: { type: Number, required: true },
    status: { type: String, default: 'Draft' }, // Draft, Posted
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.JournalEntry || mongoose.model('JournalEntry', JournalEntrySchema);