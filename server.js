const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
// ==========================================================
// 🔑 الخطوة الحاسمة 1: استدعاء dotenv لقراءة ملف .env محلياً
// يجب أن يكون هذا في أعلى الملف
// ==========================================================
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// 👇 تحديد المنفذ (Port)
const PORT = process.env.PORT || 5000; 

// ==========================================================
// 🛡️ Middleware: CORS والتجهيز
// ==========================================================

// 1. تفعيل CORS: يسمح بالاتصال من أي مكان (*). (حل مشكلة "Failed to fetch")
app.use(cors());

// 2. معالجة البيانات المرسلة (JSON)
app.use(express.json());

// 3. خدمة الملفات الثابتة
app.use(express.static('public')); 

// ==========================================================
// 🔑 الخطوة الحاسمة 2: الاتصال بقاعدة البيانات
// ==========================================================

// رابط قاعدة البيانات سيأتي من متغير البيئة MONGODB_URI (من ملف .env أو من إعدادات Vercel)
const MONGODB_URI = process.env.MONGODB_URI;

// التحقق من وجود الرابط قبل المحاولة (لحل الخطأ الذي يظهر لك الآن)
if (!MONGODB_URI) {
    console.error("❌ FATAL ERROR: MONGODB_URI is not defined in environment variables!");
    // إيقاف التطبيق إذا لم يتم العثور على الرابط
    process.exit(1); 
}

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log(`✅ Database Connected Successfully (URI Loaded)`);
})
.catch(err => {
    console.error(`❌ Database Connection Error: ${err.message}`);
});


// ==========================================================
// 🔗 ربط المسارات (Routes)
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

// ==========================================================
// 🛑 معالج الأخطاء النهائي (Error Handler)
// ==========================================================
// يلتقط أي خطأ لم يتم التقاطه في المسارات الأخرى
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Internal Server Error', error: err.message });
});

// ==========================================================
// 🚀 تشغيل السيرفر
// ==========================================================

app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);
});