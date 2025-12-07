const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================================
// 1. استدعاء كل الموديلات (قائمة كاملة)
// ==========================================================
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const SalesInvoice = require('../models/SalesInvoice');
const Account = require('../models/Account');
const StockTransaction = require('../models/StockTransaction'); 
const Car = require('../models/Car');       
const Employee = require('../models/Employee'); 
const Payroll = require('../models/Payroll');   
const TreasuryTransaction = require('../models/TreasuryTransaction'); 
const JournalEntry = require('../models/JournalEntry');

function getModel(collectionName) {
    const models = {
        'products': Product,
        'customers': Customer,
        'suppliers': Supplier,
        'accounts': Account,
        'purchase_invoices': PurchaseInvoice,
        'sales_invoices': SalesInvoice,
        'stock_transactions': StockTransaction,
        'cars': Car,
        'employees': Employee,
        'payroll': Payroll,
        'treasury': TreasuryTransaction,
        'journal': JournalEntry
    };
    return models[collectionName];
}

// ==========================================================
// 2. تصدير البيانات (Export) - مفصل لكل نوع
// ==========================================================
router.get('/export/:type', async (req, res) => {
    try {
        const type = req.params.type.trim();
        console.log(`🚀 Exporting Data: ${type} ...`);

        const Model = getModel(type);
        if (!Model) return res.status(400).json({ message: "نوع غير معروف" });

        let finalData = [];

        // --------------------------------------------
        // أ) تصدير السيارات (مفصلة بالقطع)
        // --------------------------------------------
        if (type === 'cars') {
            const cars = await Model.find().lean();
            for (const c of cars) {
                if (c.parts && c.parts.length > 0) {
                    for (const part of c.parts) {
                        finalData.push({
                            code: c.code,
                            brand: c.brand,
                            model: c.model,
                            year: c.year,
                            partName: part.name || part.partName, 
                            lengthCM: part.lengthCM || part.length || 0,
                            widthCM: part.widthCM || part.width || 0,
                            areaCM2: part.areaCM2 || part.area || 0
                        });
                    }
                } else {
                    finalData.push({
                        code: c.code, brand: c.brand, model: c.model, year: c.year,
                        partName: '', lengthCM: 0, widthCM: 0, areaCM2: 0
                    });
                }
            }
        }
        
        // --------------------------------------------
        // ب) تصدير الموظفين (كامل)
        // --------------------------------------------
        else if (type === 'employees') {
            const employees = await Model.find().lean();
            finalData = employees.map(e => ({
                code: e.code,
                name: e.name,
                nationalId: e.nationalId || '',
                insuranceId: e.insuranceId || '',
                department: e.department || '',
                jobTitle: e.jobTitle || '',
                hireDate: e.hireDate ? new Date(e.hireDate).toLocaleDateString('en-CA') : '',
                vacationBalance: e.vacationBalance || 0,
                basicSalary: e.basicSalary || 0,
                variableSalary: e.variableSalary || 0,
                insuranceSalary: e.insuranceSalary || 0,
                transportAllowance: e.transportAllowance || 0,
                otherAllowance: e.otherAllowance || 0,
                incentives: e.incentives || 0,
                totalSalary: e.totalSalary || 0
            }));
        }

        // --------------------------------------------
        // ج) تصدير الرواتب (مفصل بالشهر والموظف)
        // --------------------------------------------
        else if (type === 'payroll') {
            const payrolls = await Model.find().lean();
            const allEmps = await Employee.find().lean();
            const empCodeMap = {};
            allEmps.forEach(e => empCodeMap[e.name] = e.code);

            for (const p of payrolls) {
                if (p.details && p.details.length > 0) {
                    for (const d of p.details) {
                        finalData.push({
                            month: p.month,
                            date: p.date ? new Date(p.date).toLocaleDateString('en-CA') : '',
                            employeeCode: d.employeeCode || empCodeMap[d.employeeName] || '',
                            employeeName: d.employeeName,
                            totalSalary: d.totalSalary || 0,
                            sickLeaveDays: d.sickLeaveDays || 0,
                            annualLeaveDays: d.annualLeaveDays || 0,
                            absenceDays: d.absenceDays || 0,
                            absenceValue: d.absenceValue || 0,
                            penaltyDays: d.penaltyDays || 0,
                            penaltyValue: d.penaltyValue || 0,
                            latenessDays: d.latenessDays || 0,
                            latenessValue: d.latenessValue || 0,
                            monthlyLoan: d.monthlyLoan || 0,
                            permanentLoan: d.permanentLoan || 0,
                            totalDeductions: d.totalDeductions || 0,
                            netSalary: d.netSalary || 0
                        });
                    }
                }
            }
        }

        // --------------------------------------------
        // د) العملاء والموردين (مع كود الحساب)
        // --------------------------------------------
        else if (type === 'customers' || type === 'suppliers') {
            // استخدام strictPopulate: false لتجنب الأخطاء لو الحساب مش موجود
            const data = await Model.find().populate({ path: 'accountId', strictPopulate: false }).lean();
            finalData = data.map(item => ({
                code: item.code, 
                name: item.name, 
                phone: item.phone,
                companyName: item.companyName || '', 
                taxId: item.taxId || '',
                address: item.address || '',
                accountCode: item.accountId ? item.accountId.code : '' 
            }));
        }

        // --------------------------------------------
        // هـ) المنتجات (مع الحسابات - هنا التصحيح)
        // --------------------------------------------
        else if (type === 'products') {
            const products = await Model.find()
                // 🛑 تم إزالة inventoryAccount لأنه لم يعد موجوداً في الموديل
                .populate({ path: 'accounting.cogsAccount', strictPopulate: false })
                .populate({ path: 'accounting.salesAccount', strictPopulate: false })
                .lean();
            
            finalData = products.map(p => ({
                code: p.code, name: p.name, type: p.type, unit: p.unit,
                currentStock: p.currentStock || 0,
                purchasePrice: p.pricing?.purchasePrice || 0,
                salePrice: p.pricing?.salePrice || 0,
                length: p.dimensions?.length || 0, 
                width: p.dimensions?.width || 0,
                area: p.dimensions?.area || 0,
                unitCost: p.pricing?.unitCost || 0,
                // inventoryAccountCode: تم إلغاءه
                cogsAccountCode: p.accounting?.cogsAccount?.code || '',
                salesAccountCode: p.accounting?.salesAccount?.code || ''
            }));
        }

        // --------------------------------------------
        // و) الحسابات (الشجرة)
        // --------------------------------------------
        else if (type === 'accounts') {
             const accounts = await Model.find().sort({ code: 1 }).lean();
             finalData = accounts.map(acc => ({
                 code: acc.code, name: acc.name, type: acc.type, nature: acc.nature,
                 parentCode: acc.parentId || '', level: acc.isTransactional ? 'Sub' : 'Main',
                 balance: acc.currentBalance
             }));
        } 

        // --------------------------------------------
        // ز) فواتير المشتريات والمبيعات (تفصيل الأصناف)
        // --------------------------------------------
        else if (type === 'sales_invoices') {
            const invoices = await Model.find().populate({ path: 'customer', strictPopulate: false }).populate({ path: 'items.product', strictPopulate: false }).lean();
            for (const inv of invoices) {
                const base = {
                    invoiceNumber: inv.invoiceNumber,
                    date: inv.date ? new Date(inv.date).toLocaleDateString('en-CA') : '',
                    customerName: inv.customer ? inv.customer.name : '',
                    totalAmount: inv.finalTotal
                };
                if (inv.items && inv.items.length > 0) {
                    for (const item of inv.items) {
                        finalData.push({
                            ...base,
                            productName: item.productName || (item.product ? item.product.name : ''),
                            quantity: 1,
                            price: item.price || 0,
                            area: item.area || 0
                        });
                    }
                } else {
                    finalData.push(base);
                }
            }
        }
        else if (type === 'purchase_invoices') {
            const invoices = await Model.find().populate({ path: 'supplier', strictPopulate: false }).populate({ path: 'items.product', strictPopulate: false }).lean();
            for (const inv of invoices) {
                const base = {
                    invoiceNumber: inv.invoiceNumber,
                    date: inv.date ? new Date(inv.date).toLocaleDateString('en-CA') : '',
                    supplierName: inv.supplier ? inv.supplier.name : '',
                    warehouse: inv.warehouse || '',
                    totalAmount: inv.totalAmount
                };
                if (inv.items && inv.items.length > 0) {
                    for (const item of inv.items) {
                        finalData.push({
                            ...base,
                            productName: item.productName || (item.product ? item.product.name : ''),
                            quantity: item.quantity || 0,
                            cost: item.cost || 0,
                            lineTotal: item.lineTotal || 0
                        });
                    }
                } else {
                    finalData.push(base);
                }
            }
        }

        // --------------------------------------------
        // ح) حركات المخزن (وارد/صادر)
        // --------------------------------------------
        else if (type === 'stock_transactions') {
            const trans = await Model.find().populate({ path: 'items.product', strictPopulate: false }).lean();
            for (const t of trans) {
                for (const item of t.items) {
                    finalData.push({
                        serialNumber: t.serialNumber,
                        date: t.date ? new Date(t.date).toLocaleDateString('en-CA') : '',
                        type: t.type,
                        ref: t.supplierDoc || t.carName || '',
                        warehouse: t.warehouse || '',
                        productName: item.product ? item.product.name : '',
                        rollCode: item.rollCode || '',
                        quantity: item.quantity || 0,
                        area: item.consumedArea || 0
                    });
                }
            }
        }

        // --------------------------------------------
        // ط) النقدية (الخزينة والبنوك)
        // --------------------------------------------
        else if (type === 'treasury') {
            const trans = await Model.find().populate({ path: 'treasuryAccount', strictPopulate: false }).populate({ path: 'targetAccount', strictPopulate: false }).lean();
            finalData = trans.map(t => ({
                serialNumber: t.serialNumber,
                date: t.date ? new Date(t.date).toLocaleDateString('en-CA') : '',
                type: t.type,
                amount: t.amount,
                treasury: t.treasuryAccount?.name,
                target: t.targetAccount?.name,
                method: t.paymentMethod,
                description: t.description
            }));
        }

        // --------------------------------------------
        // ي) التصدير العام (احتياطي)
        // --------------------------------------------
        else {
             finalData = await Model.find().lean();
        }

        const worksheet = xlsx.utils.json_to_sheet(finalData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Data");
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', `attachment; filename=${type}.xlsx`);
        res.send(buffer);

    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).json({ message: "فشل التصدير: " + err.message });
    }
});

// ==========================================================
// 3. استيراد البيانات (Import Full Data)
// ==========================================================
router.post('/import/:type', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "لم يتم رفع ملف" });

        const type = req.params.type.trim();
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const Model = getModel(type);
        
        if (!Model) return res.status(400).json({ message: "نوع بيانات غير معروف" });

        const allAccounts = await Account.find().lean();
        const accMap = {}; 
        allAccounts.forEach(a => accMap[String(a.code).trim()] = a._id);

        // أ) استيراد السيارات
        if (type === 'cars') {
            const carsMap = {};
            for (const row of jsonData) {
                const code = row.code ? String(row.code).trim() : null;
                if(!code) continue;
                if (!carsMap[code]) {
                    carsMap[code] = { code, brand: row.brand, model: row.model, year: row.year, parts: [] };
                }
                if (row.partName) {
                    carsMap[code].parts.push({
                        name: row.partName,
                        lengthCM: parseFloat(row.lengthCM) || 0,
                        widthCM: parseFloat(row.widthCM) || 0,
                        areaCM2: parseFloat(row.areaCM2) || (parseFloat(row.lengthCM)*parseFloat(row.widthCM))
                    });
                }
            }
            for (const code in carsMap) {
                await Car.updateOne({ code: code }, carsMap[code], { upsert: true });
            }
        }

        // ب) استيراد الرواتب
        else if (type === 'payroll') {
            const payrollsMap = {};
            const allEmployees = await Employee.find().lean();

            for (const row of jsonData) {
                const month = row.month;
                if (!month) continue;

                if (!payrollsMap[month]) {
                    payrollsMap[month] = { month: month, details: [], totalAmount: 0, status: 'Posted' };
                }

                let emp = null;
                if(row.employeeCode) emp = allEmployees.find(e => e.code === row.employeeCode);
                if(!emp && row.employeeName) emp = allEmployees.find(e => e.name === row.employeeName);

                const detail = {
                    employee: emp ? emp._id : null,
                    employeeCode: row.employeeCode,
                    employeeName: row.employeeName,
                    totalSalary: parseFloat(row.totalSalary) || 0,
                    sickLeaveDays: parseFloat(row.sickLeaveDays) || 0,
                    annualLeaveDays: parseFloat(row.annualLeaveDays) || 0,
                    absenceDays: parseFloat(row.absenceDays) || 0,
                    absenceValue: parseFloat(row.absenceValue) || 0,
                    penaltyDays: parseFloat(row.penaltyDays) || 0,
                    penaltyValue: parseFloat(row.penaltyValue) || 0,
                    latenessDays: parseFloat(row.latenessDays) || 0,
                    latenessValue: parseFloat(row.latenessValue) || 0,
                    monthlyLoan: parseFloat(row.monthlyLoan) || 0,
                    permanentLoan: parseFloat(row.permanentLoan) || 0,
                    totalDeductions: parseFloat(row.totalDeductions) || 0,
                    netSalary: parseFloat(row.netSalary) || 0
                };
                
                if (detail.netSalary === 0 && detail.totalSalary > 0) {
                     if(detail.totalDeductions === 0) {
                        detail.totalDeductions = detail.absenceValue + detail.penaltyValue + detail.latenessValue + detail.monthlyLoan + detail.permanentLoan;
                     }
                     detail.netSalary = detail.totalSalary - detail.totalDeductions;
                }
                payrollsMap[month].details.push(detail);
                payrollsMap[month].totalAmount += detail.netSalary;
            }

            for (const m in payrollsMap) {
                await Payroll.updateOne({ month: m }, payrollsMap[m], { upsert: true });
            }
        }

        // ج) استيراد الموظفين
        else if (type === 'employees') {
            for (const row of jsonData) {
                const empCode = row.code ? String(row.code).trim() : `EMP-${Date.now()}`;
                const empData = {
                    code: empCode, name: row.name, nationalId: row.nationalId, insuranceId: row.insuranceId,
                    department: row.department, jobTitle: row.jobTitle,
                    hireDate: row.hireDate ? new Date(row.hireDate) : new Date(),
                    vacationBalance: parseFloat(row.vacationBalance) || 21,
                    basicSalary: parseFloat(row.basicSalary) || 0, variableSalary: parseFloat(row.variableSalary) || 0,
                    insuranceSalary: parseFloat(row.insuranceSalary) || 0, transportAllowance: parseFloat(row.transportAllowance) || 0,
                    otherAllowance: parseFloat(row.otherAllowance) || 0, incentives: parseFloat(row.incentives) || 0,
                    totalSalary: parseFloat(row.totalSalary) || 0
                };
                if (empData.insuranceSalary === 0) empData.insuranceSalary = empData.basicSalary + empData.variableSalary;
                if (empData.totalSalary === 0) empData.totalSalary = empData.insuranceSalary + empData.transportAllowance + empData.otherAllowance + empData.incentives;
                await Employee.updateOne({ code: empCode }, empData, { upsert: true });
            }
        }

        // د) العملاء والموردين
        else if (type === 'customers' || type === 'suppliers') {
            let counter = 0;
            for (const row of jsonData) {
                const code = row.code ? String(row.code).trim() : null;
                const updateData = {
                    name: row.name, phone: row.phone, nationalId: row.nationalId, email: row.email,
                    companyName: row.companyName, taxId: row.taxId, address: row.address,
                    isTaxable: (row.isTaxable === 'Yes' || row.isTaxable === true),
                    accountId: row.accountCode ? accMap[String(row.accountCode).trim()] : null
                };
                let existing = null;
                if (code) existing = await Model.findOne({ code: code });
                if (!existing && row.phone) existing = await Model.findOne({ phone: row.phone });

                if (existing) { await Model.updateOne({ _id: existing._id }, { $set: updateData }); } 
                else { counter++; updateData.code = code || `AUTO-${Date.now()}-${counter}`; await Model.create(updateData); }
            }
        }

        // هـ) المنتجات
        else if (type === 'products') {
            for (const row of jsonData) {
                const formattedData = { ...row };
                formattedData.accounting = {
                    // شلنا inventoryAccount هنا كمان
                    cogsAccount: accMap[row.cogsAccountCode] || null,
                    salesAccount: accMap[row.salesAccountCode] || null
                };
                if (row.length && row.width) {
                    const area = row.length * row.width;
                    formattedData.dimensions = { length: row.length, width: row.width, area: area };
                    formattedData.pricing = {
                        purchasePrice: row.purchasePrice || 0, salePrice: row.salePrice || 0,
                        unitCost: row.unitCost || (area > 0 ? row.purchasePrice / area : 0),
                        unitSalePrice: row.unitSalePrice || (area > 0 ? row.salePrice / area : 0)
                    };
                }
                await Product.updateOne({ code: row.code }, formattedData, { upsert: true });
            }
        }

        // و) الحسابات
        else if (type === 'accounts') {
            for (const row of jsonData) {
                await Account.updateOne({ code: row.code }, row, { upsert: true });
            }
        }

        // ز) عام
        else {
             for(const row of jsonData) { try { await Model.create(row); } catch (e) {} }
        }

        res.json({ message: "تم الاستيراد وتحديث البيانات بالكامل بنجاح!" });

    } catch (err) {
        console.error("Import Error:", err);
        res.status(500).json({ message: "خطأ في الاستيراد: " + err.message });
    }
});

// 👇👇👇 زرار المسح (منطقة الخطر) 👇👇👇
router.post('/reset', async (req, res) => {
    try {
        const { scope } = req.body;

        if (scope === 'transactions') {
            await SalesInvoice.deleteMany({});
            await PurchaseInvoice.deleteMany({});
            await StockTransaction.deleteMany({});
            await JournalEntry.deleteMany({});
            await TreasuryTransaction.deleteMany({});
            await Payroll.deleteMany({});

            await Product.updateMany({}, { $set: { currentStock: 0, stocks: [] } });
            await Account.updateMany({}, { $set: { currentBalance: 0 } });
            await Customer.updateMany({}, { $set: { currentBalance: 0 } });
            await Supplier.updateMany({}, { $set: { currentBalance: 0 } });
            
            res.json({ message: "تم تصفير الحركات والأرصدة بنجاح ✅" });

        } else if (scope === 'all') {
            const collections = Object.keys(mongoose.connection.collections);
            for (const collectionName of collections) {
                await mongoose.connection.collections[collectionName].drop();
            }
            res.json({ message: "تم مسح النظام بالكامل (Factory Reset) ⚠️" });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;