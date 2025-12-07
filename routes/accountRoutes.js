const express = require('express');
const router = express.Router();
const Account = require('../models/Account');

// 1. إضافة حساب
router.post('/', async (req, res) => {
    try {
        const newAccount = await Account.create(req.body);
        res.status(201).json(newAccount);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// 2. عرض الشجرة
router.get('/', async (req, res) => {
    try {
        const accounts = await Account.find().sort({ code: 1 }).lean();
        res.json(accounts);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 3. حذف
router.delete('/:id', async (req, res) => {
    try {
        await Account.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 👇👇👇 الزرار السحري: تطبيق الشجرة القياسية المنقحة 👇👇👇
router.post('/seed-standard-tree', async (req, res) => {
    try {
        // 1. مسح الشجرة القديمة (اختياري، ممكن نخليه تحديث بس الأفضل مسح عشان التنظيف)
        await Account.deleteMany({}); 

        // 2. قائمة الحسابات الجديدة (بناءً على تحليلك المالي)
        const standardTree = [
            // 1. الأصول
            { code: '1', name: 'الأصول', type: 'Asset', nature: 'Debit', isTransactional: false },
            { code: '11', name: 'أصول متداولة', type: 'Asset', nature: 'Debit', parentId: '1', isTransactional: false },
            { code: '1101', name: 'النقد وما في حكمه', type: 'Asset', nature: 'Debit', parentId: '11', isTransactional: false },
            { code: '110101', name: 'الصناديق (الخزينة)', type: 'Asset', nature: 'Debit', parentId: '1101', isTransactional: false },
            { code: '11010101', name: 'الخزينة الرئيسية', type: 'Asset', nature: 'Debit', parentId: '110101', isTransactional: true },
            { code: '110102', name: 'البنوك', type: 'Asset', nature: 'Debit', parentId: '1101', isTransactional: false },
            { code: '11010201', name: 'بنك CIB', type: 'Asset', nature: 'Debit', parentId: '110102', isTransactional: true },
            { code: '1102', name: 'العملاء والمدينون', type: 'Asset', nature: 'Debit', parentId: '11', isTransactional: false },
            { code: '110201', name: 'عملاء تجاريون', type: 'Asset', nature: 'Debit', parentId: '1102', isTransactional: true },
            { code: '1103', name: 'المخزون', type: 'Asset', nature: 'Debit', parentId: '11', isTransactional: false },
            { code: '110301', name: 'مخزن الخامات', type: 'Asset', nature: 'Debit', parentId: '1103', isTransactional: true },
            { code: '1104', name: 'أرصدة مدينة أخرى', type: 'Asset', nature: 'Debit', parentId: '11', isTransactional: false },
            { code: '110403', name: 'ضريبة القيمة المضافة (مشتريات)', type: 'Asset', nature: 'Debit', parentId: '1104', isTransactional: true },
            { code: '110404', name: 'ضريبة خصم من المنبع (مدينة)', type: 'Asset', nature: 'Debit', parentId: '1104', isTransactional: true },
            
            // الأصول غير المتداولة (مع تصحيح الإهلاك)
            { code: '12', name: 'أصول غير متداولة', type: 'Asset', nature: 'Debit', parentId: '1', isTransactional: false },
            { code: '1201', name: 'الأصول الثابتة', type: 'Asset', nature: 'Debit', parentId: '12', isTransactional: false },
            { code: '120103', name: 'الآلات والمعدات', type: 'Asset', nature: 'Debit', parentId: '1201', isTransactional: true },
            { code: '1202', name: 'مجمع الإهلاك (أصل مقابل)', type: 'Asset', nature: 'Credit', parentId: '12', isTransactional: false }, // Credit لانه بينقص الأصل
            { code: '120201', name: 'مجمع إهلاك الآلات', type: 'Asset', nature: 'Credit', parentId: '1202', isTransactional: true },

            // 2. الالتزامات
            { code: '2', name: 'الالتزامات', type: 'Liability', nature: 'Credit', isTransactional: false },
            { code: '21', name: 'الالتزامات المتداولة', type: 'Liability', nature: 'Credit', parentId: '2', isTransactional: false },
            { code: '2101', name: 'الموردين (دائنون)', type: 'Liability', nature: 'Credit', parentId: '21', isTransactional: true },
            { code: '2103', name: 'أرصدة دائنة أخرى', type: 'Liability', nature: 'Credit', parentId: '21', isTransactional: false },
            { code: '210301', name: 'ضريبة القيمة المضافة (مبيعات)', type: 'Liability', nature: 'Credit', parentId: '2103', isTransactional: true },
            { code: '210302', name: 'ضريبة خصم من المنبع (دائنة)', type: 'Liability', nature: 'Credit', parentId: '2103', isTransactional: true },
            
            // 4. الإيرادات
            { code: '4', name: 'الإيرادات', type: 'Revenue', nature: 'Credit', isTransactional: false },
            { code: '41', name: 'إيرادات التشغيل', type: 'Revenue', nature: 'Credit', parentId: '4', isTransactional: false },
            { code: '4101', name: 'إيرادات الخدمات', type: 'Revenue', nature: 'Credit', parentId: '41', isTransactional: true },

            // 5. المصاريف (مع مراكز التكلفة لا نحتاج لتفريع زائد)
            { code: '5', name: 'المصاريف', type: 'Expense', nature: 'Debit', isTransactional: false },
            { code: '51', name: 'تكلفة المبيعات (المباشرة)', type: 'Expense', nature: 'Debit', parentId: '5', isTransactional: false },
            { code: '5101', name: 'تكلفة خامات ومستلزمات', type: 'Expense', nature: 'Debit', parentId: '51', isTransactional: true }, // حساب واحد للخامات
            { code: '5102', name: 'أجور عمالة مباشرة', type: 'Expense', nature: 'Debit', parentId: '51', isTransactional: true },
            { code: '52', name: 'مصاريف بيع وتسويق', type: 'Expense', nature: 'Debit', parentId: '5', isTransactional: false },
            { code: '5201', name: 'دعاية وإعلان', type: 'Expense', nature: 'Debit', parentId: '52', isTransactional: true },
            { code: '53', name: 'مصاريف إدارية وعمومية', type: 'Expense', nature: 'Debit', parentId: '5', isTransactional: false },
            { code: '5306', name: 'كهرباء ومياه', type: 'Expense', nature: 'Debit', parentId: '53', isTransactional: true }
        ];

        await Account.insertMany(standardTree);
        res.json({ message: "تم إعادة هيكلة شجرة الحسابات بنجاح ✅" });

    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;