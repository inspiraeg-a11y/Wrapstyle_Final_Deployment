const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const TreasuryTransaction = require('../models/TreasuryTransaction');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const SalesInvoice = require('../models/SalesInvoice');     // 👇 عشان نحدث المبيعات
const PurchaseInvoice = require('../models/PurchaseInvoice'); // 👇 عشان نحدث المشتريات

// دالة الحفظ المركزية
async function handleSave(req, res, mode, oldId = null) {
    try {
        const data = req.body;
        
        // 1. تجهيز السيريال (لو جديد)
        let finalSerial = data.serialNumber;
        if (mode === 'create' || !finalSerial) {
            const treasuryAcc = await Account.findById(data.treasuryAccount);
            if (!treasuryAcc) return res.status(400).json({ message: "حساب الخزنة غير موجود" });
            
            const typePrefix = data.type === 'Inbound' ? 'IN' : 'OUT';
            const count = await TreasuryTransaction.countDocuments({ treasuryAccount: data.treasuryAccount, type: data.type });
            finalSerial = `${treasuryAcc.code}-${typePrefix}-${(count + 1).toString().padStart(4, '0')}`;
        }

        // 2. حفظ الحركة
        const newTransData = { ...data, serialNumber: finalSerial };
        if (mode === 'update' && oldId) newTransData._id = oldId;
        
        const newTrans = await TreasuryTransaction.create(newTransData);

        // ============================================================
        // 🔄 تحديث حالة الفاتورة (الربط الجديد)
        // ============================================================
        // لو الإذن ده مربوط بفاتورة (مبعوت رقمها في الوصف أو حقل مخصص)، نحدثها
        // هنعتمد هنا إننا بنكتب رقم الفاتورة في الـ description أو ممكن نبعت حقل invoiceId
        // (للتسهيل، لو الوصف فيه كلمة INV- كذا، هنعتبر ده رقم الفاتورة)
        
        if (data.invoiceId) {
            if (data.type === 'Inbound') {
                // قبض = سداد فاتورة مبيعات
                await SalesInvoice.findByIdAndUpdate(data.invoiceId, { 
                    paymentStatus: 'Paid', 
                    paidAmount: data.amount 
                });
            } else {
                // صرف = سداد فاتورة مشتريات
                await PurchaseInvoice.findByIdAndUpdate(data.invoiceId, { 
                    status: 'Paid', 
                    paidAmount: data.amount 
                });
            }
        }
        // ============================================================

        // 3. القيد المحاسبي
        let debitLine, creditLine;
        const treasuryAcc = await Account.findById(data.treasuryAccount);
        const targetAcc = await Account.findById(data.targetAccount);

        if (data.type === 'Inbound') {
            // من ح/ الخزنة ... إلى ح/ العميل
            debitLine = { accountId: treasuryAcc._id, accountName: treasuryAcc.name, debit: data.amount, credit: 0, description: `قبض: ${data.description}` };
            creditLine = { accountId: targetAcc._id, accountName: targetAcc.name, debit: 0, credit: data.amount, description: `من: ${data.description}` };
        } else {
            // من ح/ المورد ... إلى ح/ الخزنة
            debitLine = { accountId: targetAcc._id, accountName: targetAcc.name, debit: data.amount, credit: 0, description: `صرف: ${data.description}` };
            creditLine = { accountId: treasuryAcc._id, accountName: treasuryAcc.name, debit: 0, credit: data.amount, description: `إلى: ${data.description}` };
        }

        await JournalEntry.create({
            entryDate: data.date,
            referenceNo: finalSerial,
            description: `إذن ${data.type === 'Inbound' ? 'قبض' : 'صرف'} نقدية - ${data.description}`,
            lines: [debitLine, creditLine],
            totalDebit: data.amount,
            totalCredit: data.amount,
            status: 'Posted'
        });

        res.status(201).json(newTrans);

    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

router.post('/', async (req, res) => { await handleSave(req, res, 'create'); });

router.put('/:id', async (req, res) => {
    try {
        const oldTrans = await TreasuryTransaction.findById(req.params.id);
        if (!oldTrans) return res.status(404).json({ message: "غير موجود" });
        await JournalEntry.deleteOne({ referenceNo: oldTrans.serialNumber });
        await TreasuryTransaction.findByIdAndDelete(req.params.id);
        req.body.serialNumber = oldTrans.serialNumber;
        await handleSave(req, res, 'update', oldTrans._id);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const trans = await TreasuryTransaction.findById(req.params.id);
        if (!trans) return res.status(404).json({ message: "غير موجود" });
        await JournalEntry.deleteOne({ referenceNo: trans.serialNumber });
        await TreasuryTransaction.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف وإلغاء الأثر المالي" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const trans = await TreasuryTransaction.findById(req.params.id).populate('treasuryAccount targetAccount').lean();
        if (!trans) return res.status(404).json({ message: "غير موجود" });
        res.json(trans);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/', async (req, res) => {
    try {
        const { type } = req.query;
        const filter = type ? { type } : {};
        const list = await TreasuryTransaction.find(filter).populate('treasuryAccount targetAccount').sort({ date: -1 }).lean();
        res.json(list);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/balances/summary', async (req, res) => {
    try {
        const treasuries = await Account.find({ $or: [{ code: /^11/ }, { name: /خزنة|بنك/ }] }).lean();
        const balances = [];
        for (const acc of treasuries) {
            const entries = await JournalEntry.find({ 'lines.accountId': acc._id }).lean();
            let balance = 0;
            entries.forEach(e => {
                const line = e.lines.find(l => l.accountId.toString() === acc._id.toString());
                if (line) balance += (line.debit - line.credit);
            });
            balances.push({ name: acc.name, code: acc.code, balance });
        }
        res.json(balances);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;