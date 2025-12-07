const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // 👈 نحتاجه للتحقق من الـ ID
const Product = require('../models/Product');

// 1. إضافة منتج جديد
router.post('/', async (req, res) => {
    try {
        const data = req.body;
        
        // ✅ تنظيف حقول الربط المحاسبي (عشان الفراغات ما تضربش السيستم)
        if (data.accounting) {
            if (data.accounting.inventoryAccount === "") data.accounting.inventoryAccount = null;
            if (data.accounting.cogsAccount === "") data.accounting.cogsAccount = null;
            if (data.accounting.salesAccount === "") data.accounting.salesAccount = null;
        }

        // حساب التكلفة تلقائياً
        if (data.dimensions) {
            const area = (data.dimensions.length || 0) * (data.dimensions.width || 0);
            data.dimensions.area = area;
            
            if (area > 0 && data.pricing) {
                data.pricing.unitCost = (data.pricing.purchasePrice || 0) / area;
                data.pricing.unitSalePrice = (data.pricing.salePrice || 0) / area;
            }
        }

        const newProduct = new Product(data);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2. عرض كل المنتجات
router.get('/', async (req, res) => {
    try {
        const products = await Product.find().sort({ _id: -1 }).lean();
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. جلب منتج واحد (للتعديل)
router.get('/:id', async (req, res) => {
    try {
        // 🛡️ حماية: التأكد من أن الـ ID صالح قبل البحث
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "رقم المعرف (ID) غير صالح" });
        }

        const product = await Product.findById(req.params.id).lean();
        if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
        
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. تعديل منتج (PUT)
router.put('/:id', async (req, res) => {
    try {
        const data = req.body;
        
        // ✅ الإضافة: تنظيف الحسابات هنا كمان (زي الإضافة بالظبط)
        if (data.accounting) {
            if (data.accounting.inventoryAccount === "") data.accounting.inventoryAccount = null;
            if (data.accounting.cogsAccount === "") data.accounting.cogsAccount = null;
            if (data.accounting.salesAccount === "") data.accounting.salesAccount = null;
        }

        // إعادة الحسابات عند التعديل
        if (data.dimensions) {
            const area = (data.dimensions.length || 0) * (data.dimensions.width || 0);
            data.dimensions.area = area;
            if (area > 0 && data.pricing) {
                data.pricing.unitCost = (data.pricing.purchasePrice || 0) / area;
                data.pricing.unitSalePrice = (data.pricing.salePrice || 0) / area;
            }
        }

        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        
        if (!updatedProduct) return res.status(404).json({ message: "المنتج غير موجود للتعديل" });
        
        res.json(updatedProduct);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 5. حذف منتج
router.delete('/:id', async (req, res) => {
    try {
        const result = await Product.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "المنتج غير موجود للحذف" });
        
        res.json({ message: "تم الحذف بنجاح" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;