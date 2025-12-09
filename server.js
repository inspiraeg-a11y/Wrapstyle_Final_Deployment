const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// استخدام dotenv لتحميل المتغيرات المحلية من ملف .env (إذا كان موجوداً)
require('dotenv').config(); 

const app = express();

// 👇 المنفذ: سيستخدم المنفذ المعرف في بيئة النشر (مثلاً 3000 أو 80) أو 5000 محلياً
const PORT = process.env.PORT || 5000; 

// ==========================================================
// 🔑 الاتصال بقاعدة البيانات (المفتاح الذكي)
// ==========================================================

// الرابط الثابت لقاعدة البيانات على الإنترنت (MongoDB Atlas)
// ملاحظة: يتم وضعه هنا كخيار احتياطي أو كقيمة افتراضية للتشغيل المحلي إذا لم يوجد ملف .env
const ATLAS_URI = "mongodb+srv://wrapstyle:wvFnb0PHXUQPAlqc@cluster0.5h4j1gr.mongodb.net/wrapstyle_erp_db?appName=Cluster0";

// **تحديد الأولوية:**
// 1. إذا كان متغيراً في Vercel (process.env.MONGODB_URI) سيستخدمه.
// 2. إذا لم يكن موجوداً (محلياً)، سيستخدم الرابط الثابت (ATLAS_URI) الذي يحتوي على بياناتك.
const MONGODB_URI = process.env.MONGODB_URI || ATLAS_URI; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// ⚠️ التحقق من وجود الرابط قبل المحاولة 
if (!MONGODB_URI) {
    console.error("❌ FATAL ERROR: MONGODB_URI is not defined!");
    // يوقف التشغيل إذا لم يجد رابطاً (للتأكد من عدم تشغيل السيرفر بدون قاعدة بيانات)
    process.exit(1); 
}

mongoose.connect(MONGODB_URI)
.then(() => {
    // سيظهر "Mode: Atlas" إذا استخدم الرابط الذي وضعناه أو متغير البيئة
    const mode = MONGODB_URI.includes('mongodb.net') ? 'Atlas' : 'Local';
    console.log(`✅ Database Connected Successfully (Mode: ${mode})`);
})
.catch(err => {
    console.error(`❌ Database Connection Error: ${err.message}`);
    process.exit(1); 
});


// ==========================================================
// 🔗 ربط المسارات (Routes)
// ==========================================================

app.use('/api/accounts', require('./routes/accountRoutes')); 
app.use('/api/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cars', require('./routes/carRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/journal', require('./routes/journalRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/treasury', require('./routes/treasuryRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/data', require('./routes/dataRoutes'));

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);
});