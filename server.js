const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// 👇 النقطة الحرجة: نستخدم متغير البيئة (للرفع) أو نستخدم 5000 (للتشغيل المحلي)
const PORT = process.env.PORT || 5000; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// ==========================================================
// 🔑 الاتصال بقاعدة البيانات (المفتاح الذكي)
// ==========================================================

// إذا كنت ترفع على Render/Vercel، الرابط سيأتي من متغير البيئة
const CLOUD_URI = process.env.MONGODB_URI;

// إذا لم يتم العثور على رابط سحابي، نستخدم الرابط المحلي القديم
const LOCAL_URI = 'mongodb://127.0.0.1:27017/wrapstyle_erp';

const MONGODB_URI = CLOUD_URI || LOCAL_URI;

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log(`✅ Database Connected Successfully (Mode: ${CLOUD_URI ? 'Cloud' : 'Local'})`);
})
.catch(err => {
    console.error(`❌ Database Connection Error: ${err.message}`);
    // يمكنك اختيار إيقاف السيرفر هنا لو فشل الاتصال
});


// ==========================================================
// 🔗 ربط المسارات (تم تصحيح الأخطاء المطبعية)
// ==========================================================

// 1. البيانات الأساسية
app.use('/api/accounts', require('./routes/accountRoutes'));     // 👈 تم التصحيح (accountRoutes)
app.use('/api/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cars', require('./routes/carRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));

// 2. العمليات والفواتير
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));

// 3. المحاسبة والتقارير
app.use('/api/journal', require('./routes/journalRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

// 4. الإداريات
app.use('/api/treasury', require('./routes/treasuryRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));

// 5. أدوات النظام
app.use('/api/data', require('./routes/dataRoutes'));

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);
});