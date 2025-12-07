const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Supplier = require('../models/Supplier');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const SalesInvoice = require('../models/SalesInvoice');
const StockTransaction = require('../models/StockTransaction');
const Product = require('../models/Product');
// لاحظ: TreasuryTransaction بنستدعيه جوه الدالة عشان نتجنب مشاكل الـ Circular Dependency أحياناً، أو نستدعيه هنا عادي
const TreasuryTransaction = require('../models/TreasuryTransaction');

// ====================================================================
// 1. كشف حساب مورد (Supplier Statement)
// ====================================================================
router.get('/supplier-statement/:supplierId', async (req, res) => {
    try {
        const supplier = await Supplier.findById(req.params.supplierId);
        if (!supplier || !supplier.accountId) return res.status(404).json({ message: "المورد غير موجود أو غير مربوط" });

        const entries = await JournalEntry.find({ 'lines.accountId': supplier.accountId }).sort({ entryDate: 1, createdAt: 1 }).lean();

        let runningBalance = 0;
        const statement = entries.map(entry => {
            const line = entry.lines.find(l => l.accountId.toString() === supplier.accountId.toString());
            const debit = line.debit || 0;
            const credit = line.credit || 0;
            runningBalance += (credit - debit); // المورد دائن (له - عليه)

            return {
                date: entry.entryDate,
                ref: entry.referenceNo,
                desc: entry.description,
                debit: debit,
                credit: credit,
                balance: runningBalance
            };
        });

        res.json({ supplierName: supplier.name, transactions: statement, finalBalance: runningBalance });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ====================================================================
// 2. كشف حركة خزينة / بنك (Treasury Statement)
// ====================================================================
router.get('/treasury-statement', async (req, res) => {
    try {
        const { accountId, fromDate, toDate } = req.query;
        if (!accountId) return res.status(400).json({ message: "يجب اختيار الخزنة/البنك" });

        const start = fromDate ? new Date(fromDate) : new Date('1970-01-01');
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999);

        // الرصيد الافتتاحي
        const prevEntries = await JournalEntry.find({
            'lines.accountId': accountId,
            entryDate: { $lt: start }
        }).lean();

        let openingBalance = 0;
        prevEntries.forEach(entry => {
            const line = entry.lines.find(l => l.accountId.toString() === accountId);
            openingBalance += (line.debit - line.credit);
        });

        // حركات الفترة
        const entries = await JournalEntry.find({
            'lines.accountId': accountId,
            entryDate: { $gte: start, $lte: end }
        }).sort({ entryDate: 1, createdAt: 1 }).lean();

        let currentBalance = openingBalance;
        
        const statement = entries.map(entry => {
            const line = entry.lines.find(l => l.accountId.toString() === accountId);
            
            // الطرف الآخر
            const otherSides = entry.lines
                .filter(l => l.accountId.toString() !== accountId)
                .map(l => l.accountName)
                .join(' + ');

            currentBalance += (line.debit - line.credit);

            return {
                date: entry.entryDate,
                ref: entry.referenceNo,
                otherParty: otherSides || 'تسوية',
                desc: entry.description,
                debit: line.debit,
                credit: line.credit,
                balance: currentBalance
            };
        });

        const accInfo = await Account.findById(accountId).lean();

        res.json({
            accountName: accInfo.name,
            openingBalance: openingBalance,
            transactions: statement,
            finalBalance: currentBalance
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================================
// 3. تحليل ربحية أمر الشغل (Job Profitability) - المطور 🔥
// ====================================================================
router.get('/job-profitability/:invoiceNumber', async (req, res) => {
    try {
        const invNum = req.params.invoiceNumber.trim();
        
        // أ) بيانات الإيراد
        const invoice = await SalesInvoice.findOne({ invoiceNumber: invNum }).populate('carModel customer').lean();
        if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });

        const revenue = invoice.finalTotal || invoice.totalGross || 0;

        // ب) تكلفة الخامات (من المخزن - Outbound)
        // (نحتاج استدعاء الموديل هنا للتأكيد أو استخدام المتغير العلوي)
        const stockOuts = await StockTransaction.find({ 
            type: 'Outbound', 
            jobOrder: { $regex: new RegExp(`^${invNum}$`, 'i') } 
        }).populate('items.product').lean();

        let totalCost = 0;
        let materials = [];

        // تجميع الخامات
        stockOuts.forEach(trans => {
            trans.items.forEach(item => {
                if(!item.product) return;
                
                const costPerUnit = item.product.pricing?.unitCost || 0;
                const consumedArea = item.consumedArea || 0;
                const itemCost = consumedArea * costPerUnit;

                totalCost += itemCost;

                materials.push({
                    date: trans.date,
                    trxSerial: trans.serialNumber,
                    type: 'خامات',
                    product: item.product.name,
                    rollCode: item.rollCode,
                    partName: item.partName,
                    area: consumedArea,
                    cost: itemCost
                });
            });
        });

        // ج) المصاريف النقدية المباشرة (من الخزنة - Outbound) 🔥
        // نبحث في وصف حركة الخزنة عن رقم الفاتورة
        const cashExpenses = await TreasuryTransaction.find({
            type: 'Outbound',
            description: { $regex: new RegExp(invNum, 'i') }
        }).lean();

        cashExpenses.forEach(exp => {
            totalCost += exp.amount;
            materials.push({
                date: exp.date,
                trxSerial: exp.serialNumber,
                type: 'مصروف نقدي',
                product: exp.description, // الوصف (مثل: إكرامية، مشال)
                rollCode: '-',
                partName: '-',
                area: 0,
                cost: exp.amount
            });
        });

        // د) النتائج
        const profit = revenue - totalCost;
        const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0;

        res.json({
            invoiceInfo: {
                number: invoice.invoiceNumber,
                date: invoice.date,
                customer: invoice.customer?.name,
                car: invoice.carModel ? `${invoice.carModel.brand} ${invoice.carModel.model}` : 'غير محدد',
                service: invoice.serviceType
            },
            financials: {
                revenue: revenue,
                cost: totalCost,
                profit: profit,
                margin: margin
            },
            materials: materials
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================================
// 4. إحصائيات لوحة التحكم (Dashboard Stats)
// ====================================================================
router.get('/dashboard-stats', async (req, res) => {
    try {
        // 1. المبيعات (الشهر الحالي)
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const sales = await SalesInvoice.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$finalTotal" }, count: { $sum: 1 } } }
        ]);

        // 2. رصيد النقدية
        const treasuries = await Account.find({ $or: [{ code: /^110/ }, { name: /خزنة|بنك/ }] }).select('_id');
        const treasuryIds = treasuries.map(t => t._id);
        
        const cashBalance = await JournalEntry.aggregate([
            { $unwind: "$lines" },
            { $match: { "lines.accountId": { $in: treasuryIds } } },
            { $group: { _id: null, balance: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } } } }
        ]);

        // 3. المخزون
        const products = await Product.find().select('currentStock pricing.unitCost pricing.purchasePrice dimensions').lean();
        let stockValue = 0;
        products.forEach(p => {
            let cost = p.pricing?.unitCost || 0;
            if (cost === 0 && p.dimensions?.area > 0) cost = (p.pricing?.purchasePrice || 0) / p.dimensions.area;
            stockValue += (p.currentStock || 0) * cost;
        });

        // 4. العملاء (Receivables)
        const customersAcc = await Account.find({ type: 'Asset', name: /عملاء/ }).select('_id');
        const custIds = customersAcc.map(c => c._id);
        const receivables = await JournalEntry.aggregate([
            { $unwind: "$lines" },
            { $match: { "lines.accountId": { $in: custIds } } },
            { $group: { _id: null, total: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } } } }
        ]);

        // 5. الموردين (Payables)
        const suppliersAcc = await Account.find({ type: 'Liability', name: /موردين/ }).select('_id');
        const suppIds = suppliersAcc.map(s => s._id);
        const payables = await JournalEntry.aggregate([
            { $unwind: "$lines" },
            { $match: { "lines.accountId": { $in: suppIds } } },
            { $group: { _id: null, total: { $sum: { $subtract: ["$lines.credit", "$lines.debit"] } } } }
        ]);

        res.json({
            sales: { total: sales[0]?.total || 0, count: sales[0]?.count || 0 },
            cash: cashBalance[0]?.balance || 0,
            stock: stockValue,
            receivables: receivables[0]?.total || 0,
            payables: payables[0]?.total || 0
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================================
// 5. ميزان المراجعة (Trial Balance)
// ====================================================================
router.get('/trial-balance', async (req, res) => {
    try {
        const { level, fromDate, toDate } = req.query;
        const targetLevel = parseInt(level) || 3;
        
        const start = fromDate ? new Date(fromDate) : new Date('1970-01-01');
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999);

        const allAccounts = await Account.find().lean();
        const balancesMap = {}; 

        const entries = await JournalEntry.find({
            entryDate: { $gte: start, $lte: end }
        }).lean();

        entries.forEach(entry => {
            entry.lines.forEach(line => {
                const accId = line.accountId.toString();
                if (!balancesMap[accId]) balancesMap[accId] = { debit: 0, credit: 0 };
                
                balancesMap[accId].debit += (line.debit || 0);
                balancesMap[accId].credit += (line.credit || 0);
            });
        });

        let reportData = allAccounts.map(acc => {
            const bal = balancesMap[acc._id.toString()] || { debit: 0, credit: 0 };
            return {
                _id: acc._id.toString(),
                code: acc.code,
                name: acc.name,
                parentId: acc.parentId,
                isTransactional: acc.isTransactional,
                debit: bal.debit,
                credit: bal.credit,
                netBalance: bal.debit - bal.credit,
                children: []
            };
        });

        // تجميع (Roll-up)
        const reportMap = {};
        reportData.forEach(a => reportMap[a.code] = a);

        reportData.forEach(acc => {
            if (acc.parentId && reportMap[acc.parentId]) {
                reportMap[acc.parentId].children.push(acc);
            }
        });
        
        function calculateTotal(acc) {
            if (acc.children.length > 0) {
                acc.children.forEach(child => {
                    calculateTotal(child);
                    acc.debit += child.debit;
                    acc.credit += child.credit;
                    acc.netBalance += child.netBalance;
                });
            }
        }
        reportData.filter(a => !a.parentId).forEach(root => calculateTotal(root));

        let finalResult = [];
        if (targetLevel === 3) {
            finalResult = reportData.filter(a => a.isTransactional && (a.debit !== 0 || a.credit !== 0));
        } 
        else if (targetLevel === 2) {
            finalResult = reportData.filter(a => !a.isTransactional || a.code.length <= 5);
        } 
        else if (targetLevel === 1) {
            finalResult = reportData.filter(a => a.code.length === 1);
        } else {
             finalResult = reportData.filter(a => a.isTransactional && (a.debit !== 0 || a.credit !== 0));
        }

        finalResult.sort((a, b) => a.code.localeCompare(b.code));
        res.json(finalResult);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================================
// 6. دفتر الأستاذ العام (General Ledger)
// ====================================================================
router.get('/general-ledger', async (req, res) => {
    try {
        const { accountId, fromDate, toDate } = req.query;
        if (!accountId) return res.status(400).json({ message: "اختر الحساب" });

        const start = fromDate ? new Date(fromDate) : new Date('1970-01-01');
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999);

        const prevEntries = await JournalEntry.find({ 'lines.accountId': accountId, entryDate: { $lt: start } }).lean();
        let openingBalance = 0;
        prevEntries.forEach(e => {
            const l = e.lines.find(x => x.accountId.toString() === accountId);
            openingBalance += (l.debit - l.credit);
        });

        const entries = await JournalEntry.find({ 'lines.accountId': accountId, entryDate: { $gte: start, $lte: end } }).sort({ entryDate: 1, createdAt: 1 }).lean();
        
        let currentBalance = openingBalance;
        const statement = entries.map(e => {
            const line = e.lines.find(x => x.accountId.toString() === accountId);
            currentBalance += (line.debit - line.credit);
            
            return {
                date: e.entryDate,
                ref: e.referenceNo,
                desc: e.description,
                lineDesc: line.description,
                debit: line.debit,
                credit: line.credit,
                balance: currentBalance
            };
        });

        const acc = await Account.findById(accountId).lean();
        res.json({
            accountName: acc.name,
            accountCode: acc.code,
            openingBalance,
            transactions: statement,
            finalBalance: currentBalance
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================================
// 7. تحليل المبيعات والربحية (Sales & Profit Analysis)
// ====================================================================
router.get('/sales-analysis', async (req, res) => {
    try {
        const { from, to, type } = req.query;
        const start = from ? new Date(from) : new Date('1970-01-01');
        const end = to ? new Date(to) : new Date(); end.setHours(23, 59, 59, 999);

        // أ) الفواتير
        const invoices = await SalesInvoice.find({ date: { $gte: start, $lte: end } })
            .populate('customer items.product')
            .lean();

        // ب) التكلفة (صرف مخزني)
        const stockOuts = await StockTransaction.find({ 
            type: 'Outbound', 
            date: { $gte: start, $lte: end } 
        }).populate('items.product').lean();

        // خريطة تكلفة الفواتير
        const costMap = {};
        stockOuts.forEach(tx => {
            const invNum = tx.jobOrder;
            if(invNum) {
                if(!costMap[invNum]) costMap[invNum] = 0;
                tx.items.forEach(i => {
                    costMap[invNum] += (i.consumedArea * (i.product?.pricing?.unitCost || 0));
                });
            }
        });

        let reportData = [];

        if (type === 'customer') {
            const customersMap = {};
            
            invoices.forEach(inv => {
                const custName = inv.customer ? inv.customer.name : 'عميل نقدي';
                
                if(!customersMap[custName]) {
                    customersMap[custName] = { revenue: 0, cost: 0, count: 0, area: 0, pieces: 0, details: [] };
                }
                
                const currentRevenue = (inv.finalTotal || 0);
                const currentCost = (costMap[inv.invoiceNumber] || 0);
                const currentProfit = currentRevenue - currentCost;
                
                customersMap[custName].revenue += currentRevenue;
                customersMap[custName].count += 1;
                customersMap[custName].cost += currentCost;
                
                let currentArea = 0;
                let currentPieces = 0;
                inv.items.forEach(i => {
                    currentArea += (parseFloat(i.area) || 0);
                    currentPieces += 1; 
                });
                
                customersMap[custName].area += currentArea;
                customersMap[custName].pieces += currentPieces;

                customersMap[custName].details.push({
                    date: inv.date,
                    invNum: inv.invoiceNumber,
                    car: inv.carModel ? 'سيارة' : 'غير محدد', // يمكن تحسينها بـ populate carModel
                    revenue: currentRevenue
                });
            });

            for(const [name, data] of Object.entries(customersMap)) {
                reportData.push({
                    name: name,
                    count: data.count,
                    revenue: data.revenue,
                    cost: data.cost,
                    profit: data.revenue - data.cost,
                    margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : 0,
                    area: data.area,
                    pieces: data.pieces,
                    details: data.details
                });
            }
        } 
        
        else if (type === 'item') {
            const itemsMap = {};
            
            invoices.forEach(inv => {
                inv.items.forEach(item => {
                    if(item.product) {
                        const pName = item.product.name;
                        // الخامة الأم (من الموديل)
                        const pType = item.product.type || 'غير محدد'; 

                        if(!itemsMap[pName]) itemsMap[pName] = { qty: 0, revenue: 0, cost: 0, tax: 0, type: pType, details: [] };
                        
                        itemsMap[pName].qty += 1;
                        itemsMap[pName].revenue += (item.price || 0);
                        
                        let taxShare = 0;
                        if(inv.totalTax > 0 && inv.subtotal > 0) {
                            taxShare = (item.price / inv.subtotal) * inv.totalTax;
                            itemsMap[pName].tax += taxShare;
                        }
                        
                        itemsMap[pName].details.push({
                            date: inv.date,
                            invNum: inv.invoiceNumber,
                            customer: inv.customer ? inv.customer.name : 'نقدي',
                            price: item.price || 0
                        });
                    }
                });
            });

            stockOuts.forEach(tx => {
                tx.items.forEach(i => {
                    if(i.product) {
                        const pName = i.product.name;
                        if(itemsMap[pName]) {
                             itemsMap[pName].cost += (i.consumedArea * (i.product.pricing?.unitCost || 0));
                        }
                    }
                });
            });

            for(const [name, data] of Object.entries(itemsMap)) {
                reportData.push({
                    name: name,
                    type: data.type,
                    qty: data.qty,
                    revenue: data.revenue,
                    tax: data.tax,
                    cost: data.cost,
                    profit: data.revenue - data.cost,
                    margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : 0,
                    details: data.details
                });
            }
        }

        res.json(reportData);

    } catch(err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;