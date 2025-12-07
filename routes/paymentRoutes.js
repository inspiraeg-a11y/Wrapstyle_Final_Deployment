const express = require('express');
const router = express.Router();
// FIX: استدعاء الموديلات الصحيحة التي حلت محل Invoice.js
const SalesInvoice = require('../models/SalesInvoice'); 
const PurchaseInvoice = require('../models/PurchaseInvoice');
const JournalEntry = require('../models/JournalEntry'); 
const Account = require('../models/Account'); 

// 1. تسجيل عملية دفع جديدة (POST /api/payments)
router.post('/', async (req, res) => {
    try {
        const { amount, type, invoiceId, invoiceType, treasuryAccount, note } = req.body;

        if (!invoiceId || !treasuryAccount || !amount) {
             return res.status(400).json({ message: "الرجاء إدخال المبلغ، ورقم الفاتورة، وحساب الخزينة." });
        }
        
        let ModelToUpdate;
        let description;

        // تحديد نوع الفاتورة والموديل الذي سيتم تحديثه
        if (invoiceType === 'Sales') {
            ModelToUpdate = SalesInvoice;
            description = `تحصيل مبلغ ${amount} عن فاتورة مبيعات رقم ${invoiceId}`;
        } else if (invoiceType === 'Purchase') {
            ModelToUpdate = PurchaseInvoice;
            description = `سداد مبلغ ${amount} عن فاتورة مشتريات رقم ${invoiceId}`;
        } else {
            return res.status(400).json({ message: "نوع الفاتورة غير صالح (Sales أو Purchase)." });
        }
        
        // 1. تحديث حالة الفاتورة لـ "مدفوعة"
        const updatedInvoice = await ModelToUpdate.findByIdAndUpdate(
            invoiceId, 
            { status: 'Paid' }, 
            { new: true }
        );
        
        if (!updatedInvoice) {
            return res.status(404).json({ message: "الفاتورة غير موجودة أو غير قابلة للتحديث." });
        }

        // 2. إنشاء قيد يومية تلقائي (Auto Journal Entry)
        // نستخدم نفس ID الخزنة كطرف مدين ودائن لتسهيل الإطلاق، وهذا هو القيد الذي يسجل حركة النقد
        
        let debitAccount, creditAccount;
        
        if (type === 'Inbound') { // قبض (Sales Payment)
            debitAccount = treasuryAccount; // Dr: Cash/Treasury
            creditAccount = treasuryAccount; // Cr: Accounts Receivable (Temporary)
        } else { // صرف (Purchase Payment)
            debitAccount = treasuryAccount; // Dr: Accounts Payable (Temporary)
            creditAccount = treasuryAccount; // Cr: Cash/Treasury
        }
        
        const autoJournal = new JournalEntry({
            description: description,
            totalDebit: amount,
            totalCredit: amount,
            lines: [
                { accountId: debitAccount, debit: amount, credit: 0, description: type === 'Inbound' ? 'التحصيل' : 'السداد' },
                { accountId: creditAccount, debit: 0, credit: amount, description: type === 'Inbound' ? 'العملاء' : 'الموردين' }
            ],
            status: 'Posted'
        });
        
        await autoJournal.save();

        res.status(201).json({ message: "تم تسجيل الدفعة بنجاح، وتحديث الفاتورة، وتسجيل القيد." });

    } catch (err) {
        console.error("Payment Processing Error:", err);
        res.status(500).json({ message: "فشل في معالجة الدفعة: " + err.message });
    }
});

// 2. جلب سجل المدفوعات (GET /api/payments)
router.get('/', async (req, res) => {
    try {
        const payments = await Payment.find().lean(); 
        res.status(200).json(payments);
    } catch (err) {
        res.status(500).json({ message: "فشل تحميل سجل المدفوعات." });
    }
});

module.exports = router;