const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');

// ... (دالة handleSalesSave والروتس POST, PUT, DELETE كما هي تماماً - انسخها من الملف السابق) ...
// (سأضع لك الدالة والروتس الأساسية هنا للتأكد)

async function handleSalesSave(req, res, mode, oldId = null) {
    try {
        const data = req.body;
        if (mode === 'update' && oldId) data._id = oldId;

        if (mode === 'create') {
            const existing = await SalesInvoice.findOne({ invoiceNumber: data.invoiceNumber });
            if (existing) return res.status(400).json({ message: `رقم الفاتورة ${data.invoiceNumber} موجود بالفعل!` });
        }
        const newInvoice = await SalesInvoice.create(data);

        let entryLines = [];
        const totalRevenue = parseFloat(data.finalTotal) || 0;
        
        const customer = await Customer.findById(data.customer).lean();
        let customerAccountId = customer ? customer.accountId : null;
        if (!customerAccountId) {
            const generalCust = await getAccountSafe('110201');
            customerAccountId = generalCust._id;
        }

        const accVat = await getAccountSafe('210301');
        const accWht = await getAccountSafe('110404');
        const accDiscount = await getAccountSafe('5200');
        const accExtra = await getAccountSafe('410104');
        
        const revenueMap = {}; 
        const defaultSalesAcc = await getAccountSafe('4101');

        for (const item of data.items) {
            const product = await Product.findById(item.product).lean();
            if (product) {
                const area = parseFloat(item.area) || 0;
                await Product.updateOne({ _id: item.product }, { $inc: { currentStock: -area } });
                
                const salesAccId = (product.accounting && product.accounting.salesAccount) 
                    ? product.accounting.salesAccount.toString()
                    : (defaultSalesAcc ? defaultSalesAcc._id.toString() : null);

                if(salesAccId) {
                    if (!revenueMap[salesAccId]) revenueMap[salesAccId] = 0;
                    revenueMap[salesAccId] += parseFloat(item.price) || 0;
                }
            }
        }

        entryLines.push({ accountId: customerAccountId, accountName: customer?customer.name:'عميل', debit: totalRevenue, credit: 0, description: `فاتورة ${data.invoiceNumber}` });
        
        if(data.whtAmount > 0) entryLines.push({ accountId: accWht._id, accountName: 'ضريبة خصم', debit: data.whtAmount, credit: 0 });
        if(data.totalDiscount > 0) entryLines.push({ accountId: accDiscount._id, accountName: 'خصم مسموح', debit: data.totalDiscount, credit: 0 });

        for (const [accId, amount] of Object.entries(revenueMap)) {
            if(amount > 0) {
                const acc = await Account.findById(accId).lean();
                entryLines.push({ accountId: accId, accountName: acc.name, debit: 0, credit: amount, description: `مبيعات فاتورة ${data.invoiceNumber}` });
            }
        }

        if(data.totalTax > 0) entryLines.push({ accountId: accVat._id, accountName: 'ض.ق.م', debit: 0, credit: data.totalTax });
        if(data.totalExtraCosts > 0) entryLines.push({ accountId: accExtra._id, accountName: 'خدمات', debit: 0, credit: data.totalExtraCosts });

        if (entryLines.length >= 2) {
            const d = entryLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
            const c = entryLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
            const diff = d - c;
            if (Math.abs(diff) > 0.01) {
                 const accRound = await getAccountSafe('5900');
                 if(accRound) {
                     if(diff > 0) entryLines.push({ accountId: accRound._id, debit: 0, credit: diff, accountName: 'كسور' });
                     else entryLines.push({ accountId: accRound._id, debit: Math.abs(diff), credit: 0, accountName: 'كسور' });
                 }
            }
            await JournalEntry.create({
                entryDate: data.date, referenceNo: data.invoiceNumber,
                description: `فاتورة بيع - ${customer?customer.name:''}`,
                lines: entryLines, totalDebit: Math.max(d,c), totalCredit: Math.max(d,c), status: 'Posted'
            });
        }
        res.status(201).json({ message: mode === 'update' ? 'تم التعديل' : 'تم الحفظ' });
    } catch (err) { res.status(400).json({ message: err.message }); }
}

router.post('/', async (req, res) => { await handleSalesSave(req, res, 'create'); });
router.put('/:id', async (req, res) => {
    try {
        const oldInv = await SalesInvoice.findById(req.params.id);
        if(!oldInv) return res.status(404).json({message:"غير موجودة"});
        for (const item of oldInv.items) { await Product.updateOne({ _id: item.product }, { $inc: { currentStock: (item.area || 0) } }); }
        await JournalEntry.deleteOne({ referenceNo: oldInv.invoiceNumber });
        await SalesInvoice.findByIdAndDelete(req.params.id);
        await handleSalesSave(req, res, 'update', oldInv._id);
    } catch(e) { res.status(400).json({ message: e.message }); }
});
router.delete('/:id', async (req, res) => {
    try {
        const inv = await SalesInvoice.findById(req.params.id);
        if(!inv) return res.status(404).json({message:"غير موجودة"});
        for (const item of inv.items) { await Product.updateOne({ _id: item.product }, { $inc: { currentStock: (item.area || 0) } }); }
        await JournalEntry.deleteOne({ referenceNo: inv.invoiceNumber });
        await SalesInvoice.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف" });
    } catch(e) { res.status(500).json({ message: e.message }); }
});

// 👇👇👇 التعديل هنا: إضافة populate('carModel') 👇👇👇
router.get('/', async (req, res) => {
    try {
        const invs = await SalesInvoice.find()
            .populate('customer')
            .populate('carModel') // ده اللي هيجيب بيانات العربية
            .sort({ date: -1 })
            .lean();
        res.json(invs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/job-order/:invoiceNumber', async (req, res) => {
    try {
        const invoice = await SalesInvoice.findOne({ invoiceNumber: req.params.invoiceNumber }).populate('customer carModel items.product').lean();
        if (!invoice) return res.status(404).json({ message: "غير موجود" });
        res.json(invoice);
    } catch (err) { res.status(500).json({ message: err.message }); }
});
router.get('/:id', async (req, res) => {
    try {
        const invoice = await SalesInvoice.findById(req.params.id).populate('customer carModel').lean(); // وهنا كمان
        res.json(invoice);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

async function getAccountSafe(code) { return await Account.findOne({ code: code }); }

module.exports = router;