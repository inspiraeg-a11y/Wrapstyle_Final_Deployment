const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// 🌐 مسار الاتصال بقاعدة بيانات MongoDB Atlas
// يعتمد هذا المتغير الآن بالكامل على ما ستحدده في إعدادات Vercel
const MONGODB_URI = process.env.MONGODB_URI;

// التحقق من وجود متغير البيئة
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not defined in environment variables.");
    process.exit(1); // إيقاف التطبيق إذا لم يتم العثور على المسار
}

// Middlewares
app.use(cors());
app.use(express.json());

// 📡 الاتصال بقاعدة البيانات
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Cloud DB Connection: Connected Successfully!');
  })
  .catch(err => {
    console.error('❌ Cloud DB Connection Error: Failed to connect.', err.message);
  });


// 🛣️ تعريف وتضمين مسارات التطبيق (Routes)
// تأكد من أن جميع ملفات المسارات موجودة في مجلد "routes"
app.use('/api/accounts', require('./routes/accountsRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/treasury', require('./routes/treasuryRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));

// ⚙️ تشغيل السيرفر
// ملاحظة: Vercel لا يستخدم هذا الجزء، لكنه ضروري للتجربة المحلية.
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Open Browser: http://localhost:${PORT}`);
});