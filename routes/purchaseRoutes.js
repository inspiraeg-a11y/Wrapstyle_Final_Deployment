const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const PurchaseInvoice = require('../models/PurchaseInvoice');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');

// ==========================================================================
// دالة المعالجة المركزية
// ==========================================================================
async function handlePurchaseSave(req, res, mode, oldId = null) {
    try {
        const data = req.body;
        if (mode === 'update' && oldId) data._id = oldId;

        if (mode === 'create') {
            const existing = await PurchaseInvoice.findOne({ invoiceNumber: data.invoiceNumber });
            if (existing) {
                return res.status(400).json({ message: `رقم الفاتورة ${data.invoiceNumber} موجود بالفعل!` });
            }
        }

        const newInvoice = await PurchaseInvoice.create(data);

        // ========================================================
        // 🔄 القيد المحاسبي (التوجيه الإجباري)
        // ========================================================
        
        let entryLines = [];
        const totalAmount = parseFloat(data.totalAmount || 0);
        const subtotal = parseFloat(data.subtotal || 0);

        // أ) تجهيز الحسابات من الشجرة (البحث بالأكواد الثابتة)
        
        const accSuspense = await getAccountSafe('2200'); // وسيط
        if(!accSuspense) throw new Error("حساب وسيط المشتريات (2200) غير موجود!");

        const accVat = await getAccountSafe('110403'); // ضريبة مشتريات
        const accWht = await getAccountSafe('210202'); // ضريبة خصم
        const accExp = await getAccountSafe('5105');   // مصاريف شراء
        const accDisc = await getAccountSafe('4200');  // خصم مكتسب

        // ب) تحديد حساب المورد (التعديل هنا 👇)
        const supplier = await Supplier.findById(data.supplier).lean();
        const supplierName = supplier ? supplier.name : 'مورد نقدي';
        
        // 🛑 تجاهل حساب المورد القديم، والبحث عن الحساب العام للموردين
        const generalSupplierAcc = await getAccountSafe('210101');
        if(!generalSupplierAcc) throw new Error("حساب 'موردين تجاريون (عام)' كود 210101 غير موجود بالشجرة!");
        
        const suppAccId = generalSupplierAcc._id; // الإجبار على استخدام ID الحساب العام
        // (ملحوظة: بنستخدم supplierName للعرض فقط، لكن الـ ID هو للحساب العام)

        // --- تكوين السطور ---
        
        // 1. مدين: وسيط
        entryLines.push({ 
            accountId: accSuspense._id, 
            debit: subtotal, credit: 0, 
            accountName: accSuspense.name, 
            description: `تسوية استلام فاتورة ${data.invoiceNumber}` 
        });
        
        // 2. مدين: مصاريف
        if (data.totalExtraCosts > 0) {
            if(!accExp) throw new Error("حساب 5105 غير موجود!");
            entryLines.push({ 
                accountId: accExp._id, 
                debit: data.totalExtraCosts, credit: 0, 
                accountName: accExp.name, 
                description: 'مصاريف إضافية' 
            });
        }
        
        // 3. مدين: ضريبة
        if (data.totalTax > 0) {
            if(!accVat) throw new Error("حساب 110403 غير موجود!");
            entryLines.push({ 
                accountId: accVat._id, 
                debit: data.totalTax, credit: 0, 
                accountName: accVat.name, 
                description: `ضريبة 14% فاتورة ${data.invoiceNumber}` 
            });
        }

        // 4. دائن: المورد (على الحساب العام 210101)
        entryLines.push({ 
            accountId: suppAccId, 
            debit: 0, 
            credit: totalAmount, 
            accountName: supplierName, // هنا هيظهر اسم "العروبة" في القيد، بس بيصب في 210101
            description: `استحقاق فاتورة رقم ${data.invoiceNumber}` 
        });

        // 5. دائن: خصم وضرائب
        if (data.whtAmount > 0) {
            if(!accWht) throw new Error("حساب 210202 غير موجود!");
            entryLines.push({ accountId: accWht._id, debit: 0, credit: data.whtAmount, accountName: accWht.name, description: 'خصم من المنبع' });
        }
        if (data.totalDiscount > 0) {
            if(!accDisc) throw new Error("حساب 4200 غير موجود!");
            entryLines.push({ accountId: accDisc._id, debit: 0, credit: data.totalDiscount, accountName: accDisc.name, description: 'خصم تجاري' });
        }

        // تحديث السعر
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const prodId = (item.product && item.product._id) ? item.product._id : item.product;
                await Product.updateOne(
                    { _id: prodId },
                    { $set: { "pricing.purchasePrice": item.cost } } 
                );
            }
        }

        // حفظ القيد
        if (entryLines.length >= 2) {
            const d = entryLines.reduce((s,l)=>s+(parseFloat(l.debit)||0),0);
            const c = entryLines.reduce((s,l)=>s+(parseFloat(l.credit)||0),0);
            const diff = d - c;

            if (Math.abs(diff) > 0.01) {
                 const accRound = await getAccountSafe('5900');
                 if(accRound) {
                     if(diff > 0) entryLines.push({ accountId: accRound._id, debit: 0, credit: diff, accountName: accRound.name });
                     else entryLines.push({ accountId: accRound._id, debit: Math.abs(diff), credit: 0, accountName: accRound.name });
                 }
            }

            await JournalEntry.create({
                entryDate: data.date,
                referenceNo: data.invoiceNumber,
                description: `فاتورة شراء (مالي) - ${supplierName}`,
                lines: entryLines,
                totalDebit: Math.max(d, c),
                totalCredit: Math.max(d, c),
                status: 'Posted'
            });
        }

        res.status(201).json({ message: mode === 'update' ? 'تم التعديل' : 'تم الحفظ' });

    } catch (err) {
        if(!res.headersSent) res.status(400).json({ message: 'فشل العملية: ' + err.message });
    }
}

// ====================================================================
// الروتس (Routes)
// ====================================================================
router.post('/', async (req, res) => { await handlePurchaseSave(req, res, 'create'); });

router.put('/:id', async (req, res) => {
    try {
        const oldInv = await PurchaseInvoice.findById(req.params.id);
        if(!oldInv) return res.status(404).json({message:'الفاتورة غير موجودة'});
        await JournalEntry.deleteOne({referenceNo: oldInv.invoiceNumber});
        await PurchaseInvoice.findByIdAndDelete(req.params.id);
        await handlePurchaseSave(req, res, 'update', oldInv._id);
    } catch(e) { res.status(400).json({message:e.message}); }
});

router.delete('/:id', async (req, res) => {
    try {
        const inv = await PurchaseInvoice.findById(req.params.id);
        if(!inv) return res.status(404).json({message:'غير موجودة'});
        await JournalEntry.deleteOne({referenceNo: inv.invoiceNumber});
        await PurchaseInvoice.findByIdAndDelete(req.params.id);
        res.json({message:'تم الحذف'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "ID غير صالح" });
        const inv = await PurchaseInvoice.findById(req.params.id).populate('supplier items.product').lean();
        if (!inv) return res.status(404).json({ message: "غير موجودة" });
        res.json(inv);
    } catch(e) { res.status(500).json({message:e.message}); }
});

router.get('/number/:invoiceNumber', async (req, res) => {
    try {
        const inv = await PurchaseInvoice.findOne({ invoiceNumber: req.params.invoiceNumber }).populate('supplier items.product').lean();
        if (!inv) return res.status(404).json({ message: "غير موجودة" });
        res.json(inv);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/', async (req, res) => {
    try {
        const invs = await PurchaseInvoice.find().populate('supplier').sort({ date: -1 }).lean();
        res.json(invs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// دالة مساعدة (بحث فقط دون إنشاء)
async function getAccountSafe(code) {
    return await Account.findOne({ code: code });
}

module.exports = router;