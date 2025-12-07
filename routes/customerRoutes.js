const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Account = require('../models/Account');

// 1. إضافة عميل جديد (مع فتح حساب مالي له تلقائياً)
router.post('/', async (req, res) => {
    try {
        const data = req.body;

        // أ) البحث عن حساب "العملاء" الرئيسي (الأصول المتداولة)
        // الكود المعتاد للعملاء هو 1200
        let parentAccount = await Account.findOne({ code: '1200' });
        
        // لو الحساب الرئيسي مش موجود، ننشئه عشان السيستم ما يوقفش
        if (!parentAccount) {
            parentAccount = await Account.create({
                code: '1200',
                name: 'العملاء (مدينون)',
                type: 'Asset',
                nature: 'Debit',
                isTransactional: false // ده حساب رئيسي لا يقبل قيود مباشرة
            });
        }

        // ب) توليد كود حساب فرعي للعميل الجديد
        // بنعد الحسابات اللي تحت "العملاء" ونزود 1
        const count = await Account.countDocuments({ parentId: parentAccount.code });
        const newAccountCode = `${parentAccount.code}-${(count + 1).toString().padStart(4, '0')}`;

        // ج) إنشاء الحساب المالي للعميل
        const newAccount = await Account.create({
            code: newAccountCode,
            name: data.name, // اسم الحساب هو اسم العميل
            parentId: parentAccount.code,
            type: 'Asset',
            nature: 'Debit',
            isTransactional: true // يقبل قيود
        });

        // د) حفظ العميل مع ربطه بالحساب الجديد
        // بنضيف accountId للبيانات قبل الحفظ
        const newCustomer = new Customer({
            ...data,
            accountId: newAccount._id
        });
        
        const savedCustomer = await newCustomer.save();
        res.status(201).json(savedCustomer);

    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2. عرض كل العملاء
router.get('/', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ _id: -1 });
        res.status(200).json(customers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. تعديل بيانات العميل
router.put('/:id', async (req, res) => {
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        // ملحوظة: لو الاسم اتغير، المفروض نغير اسم الحساب كمان (اختياري)
        if (updatedCustomer && updatedCustomer.accountId) {
            await Account.findByIdAndUpdate(updatedCustomer.accountId, { name: updatedCustomer.name });
        }
        res.json(updatedCustomer);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 4. حذف عميل
router.delete('/:id', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: "العميل غير موجود" });

        // حذف العميل
        await Customer.findByIdAndDelete(req.params.id);
        
        // (اختياري) هل نحذف حسابه المالي؟ 
        // الأفضل لا نحذفه لو عليه قيود، لكن لو جديد ممكن نحذفه.
        // هنا سأتركه للأمان المحاسبي، أو يمكنك تفعيل السطر التالي:
        // await Account.findByIdAndDelete(customer.accountId);

        res.json({ message: "تم حذف العميل" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;