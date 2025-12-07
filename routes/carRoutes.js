const express = require('express');
const router = express.Router();
const Car = require('../models/Car');

// 1. إضافة موديل سيارة جديد (مع حساب المساحة تلقائياً)
router.post('/', async (req, res) => {
    try {
        // التأكد من البيانات قبل الحفظ
        const { code, brand, model, year, parts } = req.body;

        if (!brand || !model) {
            return res.status(400).json({ message: "البيانات الأساسية (الماركة، الموديل) مطلوبة." });
        }

        // تجهيز الأجزاء وحساب المساحة (معادلتك الأصلية)
        const processedParts = parts.map(part => ({
            name: part.name,
            lengthCM: part.lengthCM || 0,
            widthCM: part.widthCM || 0,
            areaCM2: (part.lengthCM || 0) * (part.widthCM || 0) // حساب المساحة أوتوماتيك
        }));

        const newCar = new Car({
            code, brand, model, year, 
            parts: processedParts
        });

        const savedCar = await newCar.save();
        res.status(201).json(savedCar);
    } catch (err) {
        console.error("POST /cars ERROR:", err);
        // التعامل مع خطأ التكرار (Duplicate Key)
        if (err.code === 11000) {
            return res.status(400).json({ message: "كود السيارة هذا موجود بالفعل." });
        }
        res.status(400).json({ message: "فشل الحفظ: " + err.message });
    }
});

// 2. جلب كل موديلات السيارات (لتعبئة القائمة المنسدلة)
router.get('/', async (req, res) => {
    try {
        const cars = await Car.find().select('code brand model year parts').lean();
        res.status(200).json(cars);
    } catch (err) {
        res.status(500).json({ message: "فشل تحميل قائمة السيارات." });
    }
});

// 3. جلب قطع سيارة معينة (لجدول الفاتورة)
router.get('/:carId/parts', async (req, res) => {
    try {
        const car = await Car.findById(req.params.carId).select('parts').lean();
        if (!car) return res.status(404).json({ message: "موديل السيارة غير موجود." });
        res.status(200).json(car.parts);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب أجزاء السيارة." });
    }
});

// 4. حذف سيارة (إضافة ضرورية عشان زرار الحذف يشتغل)
router.delete('/:id', async (req, res) => {
    try {
        await Car.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم الحذف بنجاح' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;