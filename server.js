const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// قد تحتاج لـ dotenv لاستخدام .env محليًا
// const dotenv = require('dotenv');
// dotenv.config();

const app = express();
// استخدم متغير PORT من البيئة (Vercel يستخدمه) أو 5000 محليًا
const PORT = process.env.PORT || 5000; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================================================
// 🔑 الاتصال بقاعدة البيانات باستخدام متغير البيئة (Critical Fix)
// ==========================================================

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not defined! Check Vercel Environment Variables or your local .env file.");
    // يتوقف السيرفر عن العمل إذا لم يجد المتغير
    process.exit(1);
}

mongoose.connect(MONGODB_URI) 
.then(() => console.log('✅ Database Connected Successfully'))
.catch(err => console.log('❌ Database Connection Error:', err));


// ==========================================================
// 🔗 ربط المسارات (All Routes) - تم تصحيح الأخطاء المطبعية
// ==========================================================

// 1. البيانات الأساسية
app.use('/api/accounts', require('./routes/accountRoutes'));    
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