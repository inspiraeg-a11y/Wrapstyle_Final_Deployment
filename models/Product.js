const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true }, 
    name: { type: String, required: true }, 
    type: { type: String, required: true }, 
    unit: { type: String, required: true }, 
    
    // الرصيد الإجمالي (مجموع كل المخازن) - للعرض السريع
    currentStock: { type: Number, default: 0 }, 

    // 👇👇👇 الجديد: تفصيل الرصيد لكل مخزن 👇👇👇
    stocks: [{
        warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
        quantity: { type: Number, default: 0 }
    }],

    dimensions: {
        length: { type: Number, default: 0 }, 
        width: { type: Number, default: 0 },  
        area: { type: Number, default: 0 }    
    },

    pricing: {
        purchasePrice: { type: Number, required: true },
        salePrice: { type: Number, required: true },
        unitCost: { type: Number, default: 0 },          
        unitSalePrice: { type: Number, default: 0 } 
    },

    // شلنا حساب المخزن من هنا (لأنه هيجي من شجرة المخازن)
    accounting: {
        // inventoryAccount: ... (تم الاستغناء عنه هنا)
        cogsAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },      
        salesAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' }      
    },

    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);