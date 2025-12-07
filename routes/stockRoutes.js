const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ---------------------------------------------------------
// استدعاء الموديلات الضرورية
// ---------------------------------------------------------
const StockTransaction = require('../models/StockTransaction');
const Product = require('../models/Product');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const PurchaseInvoice = require('../models/PurchaseInvoice'); 
const Supplier = require('../models/Supplier');
const Warehouse = require('../models/Warehouse');

// ====================================================================
// 1. تسجيل حركة مخزنية جديدة (استلام أو صرف) + القيود
// ====================================================================
router.post('/', async (req, res) => {
    try {
        // استقبال البيانات من الشاشة
        const { type, items, serialNumber, supplierDoc, warehouse, ...rest } = req.body;
        
        // توليد رقم الإذن تلقائياً لو مش مبعوت (TRX-Time)
        const finalSerial = serialNumber || ('TRX-' + Math.floor(Date.now() / 1000));

        // -------------------------------------------------------
        // 🛑 منطقة التفتيش (Validation Zone) - لمنع الدبلرة والاستلام الجزئي
        // -------------------------------------------------------
        
        if (type === 'Inbound') {
            // أ) منع استلام نفس فاتورة الشراء مرتين (مع السماح بالجزئي)
            if (supplierDoc && supplierDoc.trim()) {
                const cleanDoc = supplierDoc.trim();
                
                // 1. البحث عن الفاتورة الأصلية للتحقق من الكميات
                const invoice = await PurchaseInvoice.findOne({ invoiceNumber: { $regex: new RegExp(`^${cleanDoc}$`, 'i') } });
                
                // 2. البحث عن الاستلامات السابقة لنفس الفاتورة
                const prevTrans = await StockTransaction.find({ 
                    type: 'Inbound', 
                    supplierDoc: { $regex: new RegExp(`^${cleanDoc}$`, 'i') } 
                });

                if (invoice) {
                    // إجمالي الكمية المطلوبة في الفاتورة
                    const totalOrdered = invoice.items.reduce((sum, i) => sum + (i.quantity || 0), 0);

                    // إجمالي اللي استلمناه قبل كدة
                    let totalReceivedSoFar = 0;
                    prevTrans.forEach(t => {
                        t.items.forEach(i => totalReceivedSoFar += (i.quantity || 0));
                    });

                    // إجمالي اللي بنحاول نستلمه دلوقتي
                    const currentQty = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);

                    // فحص هل تم الاستلام بالكامل؟
                    if (totalReceivedSoFar >= totalOrdered) {
                        return res.status(400).json({ 
                            message: `⛔ خطأ: الفاتورة رقم (${cleanDoc}) تم استلام كامل كمياتها مسبقاً (${totalReceivedSoFar} / ${totalOrdered}).` 
                        });
                    }
                    
                    // فحص هل الكمية الجديدة تتجاوز المتبقي؟
                    if ((totalReceivedSoFar + currentQty) > totalOrdered) {
                         return res.status(400).json({ 
                            message: `⛔ خطأ: الكمية الواردة (${currentQty}) تزيد عن المتبقي من الفاتورة. المتبقي فقط: (${totalOrdered - totalReceivedSoFar}).` 
                        });
                    }
                } else {
                    // لو الفاتورة مش متسجلة (استلام حر)، نكتفي بمنع تكرار رقم الفاتورة لو موجودة بالكامل
                    // (ده الكود القديم اللي كان بيمنع الدبلرة لو مفيش فاتورة أصلية)
                    if (prevTrans.length > 0 && !invoice) {
                        // ممكن نسمح بيها كاستلام حر متعدد، أو نمنعها حسب سياستك.
                        // هنا هنسيبها تعدي عشان المرونة، بس هنحذر من الرولات المكررة.
                    }
                }
            }

            // ب) منع تكرار كود الرول (Serial Number لكل رول)
            for (const item of items) {
                // نتأكد إن الكود مش أوتوماتيك ومش كلمة NEW
                if (item.rollCode && !item.rollCode.includes('AUTO') && item.rollCode !== 'NEW') {
                    const cleanRoll = item.rollCode.trim();
                    
                    // البحث هل الرول ده دخل المخزن قبل كده؟
                    const existingRoll = await StockTransaction.findOne({
                        type: 'Inbound',
                        'items.rollCode': { $regex: new RegExp(`^${cleanRoll}$`, 'i') }
                    });

                    if (existingRoll) {
                        return res.status(400).json({ 
                            message: `⛔ خطأ: كود الرول (${cleanRoll}) موجود بالفعل في المخزن (إذن رقم ${existingRoll.serialNumber}). يرجى التأكد من الكود.` 
                        });
                    }
                }
            }
        }
        // -------------------------------------------------------

        // 👇👇 التعديل: تجهيز بيانات المخزن المختار 👇👇
        let whName = 'المخزن الرئيسي';
        let whAccId = null;
        
        if (warehouse) {
            const whDoc = await Warehouse.findById(warehouse);
            if (whDoc) {
                whName = whDoc.path;      // الاسم للعرض والحفظ
                whAccId = whDoc.accountId; // الحساب للقيد
            }
        }

        // 2. حفظ الحركة في قاعدة البيانات
        const newTrans = await StockTransaction.create({
            serialNumber: finalSerial, 
            type, 
            items, 
            supplierDoc: supplierDoc ? supplierDoc.trim() : null, 
            warehouse: whName, // حفظنا الاسم
            ...rest
        });

        // -------------------------------------------------------
        // 3. المعالجة المحاسبية وتحديث أرصدة المخزن
        // -------------------------------------------------------
        let journalLines = [];
        let totalValue = 0;

        // أ) تحديد حساب المخزن (من الشجرة أو الافتراضي)
        let invAccId = whAccId;
        if (!invAccId) {
            // لو مفيش حساب مربوط، نجيب حساب عام 110301
            let defInv = await getAccount('110301', 'مخزن الخامات الرئيسي', 'Asset', 'Debit');
            invAccId = defInv._id;
        }

        // حساب تكلفة النشاط
        let cogsAcc = await getAccount('5100', 'تكلفة النشاط (عام)', 'Expense', 'Debit');
        
        // ب) تحديد حساب الطرف الآخر (مورد أو وسيط)
        let creditAccount = null; 
        if (type === 'Inbound' && supplierDoc) {
            const invoice = await PurchaseInvoice.findOne({ invoiceNumber: supplierDoc });
            if (invoice && invoice.supplier) {
                const supplier = await Supplier.findById(invoice.supplier);
                if (supplier && supplier.accountId) {
                    creditAccount = await Account.findById(supplier.accountId);
                }
            }
        }
        
        // في الاستلام: الطرف الدائن هو "وسيط الموردين" (عشان الفاتورة هتقفله)
        // أو "حساب المشتريات" (حسب طلبك الأخير لتوحيد القيد)
        // هنا سنستخدم حساب "المشتريات (وسيط)" 2200 كما طلبت
        if (!creditAccount || type === 'Inbound') {
             creditAccount = await getAccount('2200', 'موردين - وسيط استلام', 'Liability', 'Credit');
        }

        // الدوران على الأصناف لتحديث الرصيد وحساب القيمة
        for (const item of items) {
            const product = await Product.findById(item.product);
            
            if (product) {
                let amount = 0;
                
                if (type === 'Outbound') {
                    // --> حالة الصرف (Outbound)
                    // التكلفة = المساحة المصروفة * تكلفة الوحدة (المتوسط المرجح)
                    const area = item.consumedArea || 0;
                    amount = area * (product.pricing?.unitCost || 0);
                    
                    // خصم الكمية من المخزن العام
                    await Product.updateOne(
                        { _id: product._id }, 
                        { $inc: { currentStock: -area } }
                    );

                    // خصم رصيد المخزن الفرعي (تحديث المصفوفة)
                    if(warehouse) {
                        await Product.updateOne(
                            { _id: product._id, "stocks.warehouse": warehouse },
                            { $inc: { "stocks.$.quantity": -area } }
                        );
                    }

                } else {
                    // --> حالة الاستلام (Inbound)
                    // حساب المساحة المستلمة (الكمية * مساحة الرول الواحد)
                    const rollArea = product.dimensions?.area || 0;
                    const totalArea = (item.quantity || 0) * rollArea;
                    
                    // حساب القيمة المالية (يفضل سعر الشراء المباشر في الاستلام)
                    amount = totalArea * (product.pricing?.unitCost || product.pricing?.purchasePrice || 0);
                    
                    // زيادة الكمية في المخزن العام
                    await Product.updateOne(
                        { _id: product._id }, 
                        { $inc: { currentStock: totalArea } }
                    );

                    // زيادة رصيد المخزن الفرعي
                    if(warehouse) {
                        const exists = await Product.findOne({ _id: product._id, "stocks.warehouse": warehouse });
                        if(exists) {
                            await Product.updateOne(
                                { _id: product._id, "stocks.warehouse": warehouse },
                                { $inc: { "stocks.$.quantity": totalArea } }
                            );
                        } else {
                            await Product.updateOne(
                                { _id: product._id },
                                { $push: { stocks: { warehouse: warehouse, quantity: totalArea } } }
                            );
                        }
                    }
                }

                // تجهيز سطور القيد (لو فيه قيمة مالية)
                if (amount > 0) {
                    totalValue += amount;
                    
                    // استخدام حسابات الصنف الخاصة لو موجودة، وإلا نستخدم العام
                    // (لاحظ: هنا بنستخدم invAccId اللي جبناه من المخزن المختار)
                    const prodInvAcc = product.accounting?.inventoryAccount || invAccId; 
                    const prodCogsAcc = product.accounting?.cogsAccount || cogsAcc._id;

                    if (type === 'Outbound') {
                        // قيد الصرف: من ح/ تكلفة النشاط ... إلى ح/ المخزن المحدد
                        journalLines.push({ 
                            accountId: prodCogsAcc, 
                            debit: amount, credit: 0, 
                            description: `صرف تشغيل: ${product.name} - ${item.partName || ''}` 
                        });
                        journalLines.push({ 
                            accountId: invAccId, 
                            debit: 0, credit: amount, 
                            description: `نقص مخزن: ${whName}` 
                        });
                    } else {
                        // قيد الاستلام: من ح/ المخزن المحدد ... إلى ح/ المشتريات (وسيط)
                        journalLines.push({ 
                            accountId: invAccId, 
                            debit: amount, credit: 0, 
                            description: `استلام مخزني: ${product.name}` 
                        });
                        journalLines.push({ 
                            accountId: creditAccount._id, 
                            debit: 0, credit: amount, 
                            description: `استحقاق مخزني: ${product.name} (${supplierDoc || ''})` 
                        });
                    }
                }
            }
        }

        // 4. حفظ القيد في دفتر اليومية
        if (journalLines.length > 0) {
            await JournalEntry.create({
                entryDate: rest.date,
                referenceNo: finalSerial,
                description: `قيد مخزني (${type === 'Inbound' ? 'استلام' : 'صرف'}) - ${whName}`,
                totalDebit: totalValue,
                totalCredit: totalValue,
                lines: journalLines,
                status: 'Posted'
            });
        }

        res.status(201).json(newTrans);

    } catch (err) {
        console.error("Stock Save Error:", err);
        res.status(400).json({ message: 'فشل الحفظ: ' + err.message });
    }
});

// ====================================================================
// 2. التحويل بين المخازن (Transfer)
// ====================================================================
router.post('/transfer', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { fromWarehouse, toWarehouse, items, date, notes } = req.body;
        const serial = 'TRF-' + Math.floor(Date.now() / 1000);

        // 1. صرف من المصدر
        await StockTransaction.create([{
            serialNumber: serial + '-OUT', type: 'Outbound', warehouse: fromWarehouse, date, transactionReason: 'تحويل صادر', notes: `إلى ${toWarehouse}`,
            items: items.map(i => ({ product: i.product, rollCode: i.rollCode, consumedArea: i.area, partName: 'تحويل' }))
        }], { session });

        // 2. استلام في الوجهة
        await StockTransaction.create([{
            serialNumber: serial + '-IN', type: 'Inbound', warehouse: toWarehouse, date, transactionReason: 'تحويل وارد', notes: `من ${fromWarehouse}`,
            items: items.map(i => ({ product: i.product, rollCode: i.rollCode, quantity: 1, customDimensions: { length: i.length, width: i.width } }))
        }], { session });
        
        await session.commitTransaction();
        res.json({ message: "تم التحويل بنجاح" });
    } catch (err) {
        await session.abortTransaction();
        res.status(400).json({ message: err.message });
    } finally { session.endSession(); }
});


// ====================================================================
// 3. العمليات العامة (الحذف، الجلب بالـ ID، العرض)
// ====================================================================

router.delete('/:id', async (req, res) => {
    try {
        const trans = await StockTransaction.findById(req.params.id);
        if (!trans) return res.status(404).json({ message: "غير موجودة" });
        
        for (const item of trans.items) {
            const product = await Product.findById(item.product);
            if (product) {
                if (trans.type === 'Outbound') {
                    await Product.updateOne({_id: item.product}, { $inc: { currentStock: (item.consumedArea||0) } });
                } else {
                    const rollArea = product.dimensions?.area || 0;
                    await Product.updateOne({_id: item.product}, { $inc: { currentStock: -((item.quantity||0) * rollArea) } });
                }
            }
        }
        await JournalEntry.deleteOne({ referenceNo: trans.serialNumber });
        await StockTransaction.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/available-rolls', async (req, res) => {
    try {
        const prodId = req.query.productId;
        if (!prodId) return res.json([]);
        const inboundTrans = await StockTransaction.find({ type: 'Inbound', 'items.product': prodId }).lean();
        const rolls = inboundTrans.flatMap(t => t.items.filter(i => i.product.toString() === prodId && i.rollCode).map(i => i.rollCode));
        res.json([...new Set(rolls)]);
    } catch (err) { res.json([]); }
});

router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({message:'ID غير صالح'});
        const trans = await StockTransaction.findById(req.params.id).lean();
        if(!trans) return res.status(404).json({message:'غير موجود'});
        res.json(trans);
    } catch (err) { res.status(500).json({message: err.message}); }
});

router.get('/', async (req, res) => {
    const trans = await StockTransaction.find().sort({ date: -1 }).lean();
    res.json(trans);
});

// ====================================================================
// 4. الروتس الفرعية (GET) - للعرض والبحث
// ====================================================================

// أ) تقرير التحليل المالي (Flattened Data)
router.get('/analysis', async (req, res) => {
    try {
        const trans = await StockTransaction.find().populate('items.product').sort({ date: 1 }).lean();
        let analysisData = [];

        for (const t of trans) {
            for (const item of t.items) {
                if (!item.product) continue;

                let qtyIn = 0, qtyOut = 0, areaIn = 0, areaOut = 0;
                const unitCost = item.product.pricing?.unitCost || 0;
                let len = 0, wid = 0;

                if (t.type === 'Inbound') {
                    len = item.customDimensions?.length || item.product.dimensions?.length || 0;
                    wid = item.customDimensions?.width || item.product.dimensions?.width || 0;
                    areaIn = (item.quantity || 0) * (len * wid);
                } else {
                    len = item.consumedLength || 0;
                    wid = item.consumedWidth || 0;
                    areaOut = item.consumedArea || (len * wid);
                }

                analysisData.push({
                    date: t.date, serial: t.serialNumber, type: t.type,
                    docRef: t.supplierDoc || t.jobOrder || '-',
                    productCode: item.product.code, productName: item.product.name,
                    rollCode: item.rollCode || '-', // كود الرول المهم
                    length: len, width: wid,
                    areaIn: areaIn, areaOut: areaOut,
                    unitCost: unitCost,
                    totalValue: (areaIn + areaOut) * unitCost
                });
            }
        }
        res.json(analysisData);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ب) الرولات المتاحة
router.get('/available-rolls', async (req, res) => {
    try {
        const prodId = req.query.productId;
        if (!prodId) return res.json([]);

        // بنبحث عن كل حركات "الاستلام" (Inbound) اللي فيها المنتج ده
        const inboundTrans = await StockTransaction.find({ 
            type: 'Inbound',
            'items.product': prodId 
        }).lean();
        
        let rolls = [];
        
        // استخراج أكواد الرولات
        if (inboundTrans && inboundTrans.length > 0) {
            inboundTrans.forEach(t => {
                if (t.items) {
                    t.items.forEach(item => {
                        // التأكد من مطابقة المنتج + وجود كود للرول
                        if (String(item.product) === String(prodId) && item.rollCode) {
                            rolls.push(item.rollCode);
                        }
                    });
                }
            });
        }
        
        // إرجاع قائمة فريدة (بدون تكرار)
        const uniqueRolls = [...new Set(rolls)];
        res.json(uniqueRolls);
        
    } catch (err) { 
        console.error("Rolls Error:", err);
        res.json([]); // إرجاع مصفوفة فارغة في حالة الخطأ
    }
});

// ج) تقارير وارد وصادر
router.get('/inbound-only', async (req, res) => { 
    const h = await StockTransaction.find({type:'Inbound'}).populate('items.product', 'name code').sort({date:-1}).lean();
    res.json(h); 
});

router.get('/outbound-only', async (req, res) => { 
    const h = await StockTransaction.find({type:'Outbound'}).populate('items.product', 'name code').sort({date:-1}).lean();
    res.json(h); 
});

// د) جلب حركة واحدة بالـ ID (لازم يكون في الآخر)
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({message:'ID غير صالح'});
        const trans = await StockTransaction.findById(req.params.id).lean();
        if(!trans) return res.status(404).json({message:'غير موجود'});
        res.json(trans);
    } catch (err) { res.status(500).json({message: err.message}); }
});

// هـ) عرض الكل
router.get('/', async (req, res) => {
    const trans = await StockTransaction.find().sort({ date: -1 }).lean();
    res.json(trans);
});

// دالة مساعدة لإنشاء الحسابات
async function getAccount(code, name, type, nature) {
    let acc = await Account.findOne({ code: code });
    if (!acc) {
        acc = await Account.create({ 
            code, 
            name, 
            type, 
            nature, 
            isTransactional: true 
        });
    }
    return acc;
}

module.exports = router;