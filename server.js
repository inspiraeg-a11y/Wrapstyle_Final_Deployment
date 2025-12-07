const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// 👇 لو بترفع على استضافة، هي تاخد البورت أوتوماتيك، لو محلي هتاخد 5001
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// 👇👇👇 رابط الاتصال بالسيرفر السحابي (MongoDB Atlas) 👇👇👇
// ⚠️ هام جداً: امسح <db_password> واكتب الباسورد بتاعتك
const MONGO_URI = "mongodb+srv://amir:01275810008@cluster0.of78w8g.mongodb.net/empyrean_erp?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB Atlas (Cloud) Successfully!'))
.catch(err => console.log('❌ Cloud DB Connection Error:', err));

// ==========================================================
// 🔗 خريطة المسارات (All Routes)
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
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`🌐 Open Browser: http://localhost:${PORT}`);
});