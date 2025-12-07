const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');

// 1. إضافة مورد جديد (بدون فتح حساب مالي خاص)
router.post('/', async (req, res) => {
    try {
        // بنحفظ بيانات المورد بس
        const newSupplier = await Supplier.create(req.body);
        res.status(201).json(newSupplier);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2. عرض كل الموردين
router.get('/', async (req, res) => {
    try {
        const suppliers = await Supplier.find().sort({ _id: -1 });
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. تعديل
router.put('/:id', async (req, res) => {
    try {
        const updated = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// 4. حذف
router.delete('/:id', async (req, res) => {
    try {
        await Supplier.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;