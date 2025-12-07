const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');

// 1. الموظفين (زي ما هو)
router.post('/employees', async (req, res) => {
    try {
        if (req.body._id) {
            const { _id, ...updateData } = req.body;
            await Employee.findByIdAndUpdate(_id, updateData);
            res.json({ message: 'تم التحديث' });
        } else {
            const existing = await Employee.findOne({ code: req.body.code });
            if (existing) return res.status(400).json({ message: 'الكود مكرر' });
            await Employee.create(req.body);
            res.status(201).json({ message: 'تم الحفظ' });
        }
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.get('/employees', async (req, res) => {
    const emps = await Employee.find().sort({ _id: -1 }).lean();
    res.json(emps);
});

router.get('/employees/:id', async (req, res) => {
    const emp = await Employee.findById(req.params.id).lean();
    if(!emp) return res.status(404).json({message: "غير موجود"});
    res.json(emp);
});

router.delete('/employees/:id', async (req, res) => {
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
});

// 2. الرواتب (الحفظ المبدئي)
router.post('/payroll', async (req, res) => {
    try {
        const data = req.body;
        
        // لو موجود، نحدثه (أو نحذفه وننشئه)
        const existing = await Payroll.findOne({ month: data.month });
        if(existing) {
            // استرجاع الرصيد القديم
            for(const d of existing.details) {
                if(d.annualLeaveDays > 0) await Employee.updateOne({_id: d.employee}, {$inc: {vacationBalance: d.annualLeaveDays}});
            }
            await Payroll.deleteOne({ month: data.month });
            // مش هنمسح القيد هنا، هنسيبه لزرار الترحيل الجديد
        }
        
        // حفظ الجديد
        const payroll = await Payroll.create(data);

        // خصم الإجازات الجديدة
        for (const row of data.details) {
            if (row.annualLeaveDays > 0 && row.employee) {
                await Employee.updateOne(
                    { _id: row.employee },
                    { $inc: { vacationBalance: -row.annualLeaveDays } }
                );
            }
        }
        
        // ملحوظة: شلنا القيد من هنا عشان نعمله يدوي من زرار "ترحيل" في الشاشة التانية
        // أو لو عايز تخليه أوتوماتيك، ممكن ننادي دالة الترحيل هنا.
        // بس عشان الاستيراد، الأفضل نفصله.

        res.status(201).json(payroll);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// 👇👇👇 (الجديد) ترحيل القيد المحاسبي المفصل (من الأرشيف) 👇👇👇
router.post('/payroll/:id/post', async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id);
        if (!payroll) return res.status(404).json({ message: "الكشف غير موجود" });

        // 1. مسح القيد القديم إن وجد لنفس الشهر
        await JournalEntry.deleteOne({ referenceNo: `PAY-${payroll.month}` });

        // 2. تجميع الأرقام للحسابات المختلفة
        let totalBasic = 0;      // الراتب الشامل (مدين)
        let totalMonthlyLoan = 0; // سلف شهرية (دائن)
        let totalPermLoan = 0;    // سلف مستديمة (دائن)
        let totalPenalties = 0;   // خصومات غياب وتأخير (دائن)
        let totalNet = 0;         // الصافي (دائن - خزنة)

        payroll.details.forEach(d => {
            totalBasic += (d.totalSalary || 0);
            totalMonthlyLoan += (d.monthlyLoan || 0);
            totalPermLoan += (d.permanentLoan || 0);
            
            // تجميع الخصومات الإدارية (غياب + تأخير + جزاء)
            const penalties = (d.absenceValue || 0) + (d.penaltyValue || 0) + (d.latenessValue || 0);
            totalPenalties += penalties;

            totalNet += (d.netSalary || 0);
        });

        // 3. تجهيز الحسابات (Auto-Create لو مش موجودة)
        const accSalaries = await getAccount('5300', 'رواتب وأجور', 'Expense', 'Debit');
        const accMonthlyLoan = await getAccount('1203', 'سلف عاملين (شهرية)', 'Asset', 'Debit'); // بنقلل الأصل
        const accPermLoan = await getAccount('1204', 'قروض عاملين (مستديمة)', 'Asset', 'Debit');
        const accPenalties = await getAccount('4901', 'خصومات موظفين', 'Revenue', 'Credit');
        const accCash = await getAccount('1101', 'الخزيذنة الرئيسية', 'Asset', 'Debit');

        // 4. بناء سطور القيد
        let lines = [];

        // المدين: إجمالي الرواتب
        lines.push({ 
            accountId: accSalaries._id, accountName: 'رواتب وأجور', 
            debit: totalBasic, credit: 0, description: `استحقاق رواتب شهر ${payroll.month}` 
        });

        // الدائن: سلف شهرية (تسوية)
        if (totalMonthlyLoan > 0) {
            lines.push({ 
                accountId: accMonthlyLoan._id, accountName: 'سلف عاملين', 
                debit: 0, credit: totalMonthlyLoan, description: 'خصم سلف شهرية' 
            });
        }

        // الدائن: سلف مستديمة (تسوية)
        if (totalPermLoan > 0) {
            lines.push({ 
                accountId: accPermLoan._id, accountName: 'قروض عاملين', 
                debit: 0, credit: totalPermLoan, description: 'خصم قسط قرض' 
            });
        }

        // الدائن: خصومات وجزاءات (إيراد أو تخفيض)
        if (totalPenalties > 0) {
            lines.push({ 
                accountId: accPenalties._id, accountName: 'خصومات وجزاءات', 
                debit: 0, credit: totalPenalties, description: 'غياب وتأخيرات' 
            });
        }

        // الدائن: الصافي (صرف من الخزنة)
        lines.push({ 
            accountId: accCash._id, accountName: 'الخزينة الرئيسية', 
            debit: 0, credit: totalNet, description: `صرف صافي الرواتب` 
        });

        // موازنة (للفروق البسيطة إن وجدت بسبب الكسور)
        const totalDr = lines.reduce((s, l) => s + l.debit, 0);
        const totalCr = lines.reduce((s, l) => s + l.credit, 0);
        const diff = totalDr - totalCr;
        if (Math.abs(diff) > 0.01) {
             const accRound = await getAccount('5900', 'فروق تقريب', 'Expense', 'Debit');
             if(diff > 0) lines.push({ accountId: accRound._id, debit: 0, credit: diff, accountName: 'كسور' });
             else lines.push({ accountId: accRound._id, debit: Math.abs(diff), credit: 0, accountName: 'كسور' });
        }

        // 5. حفظ القيد
        await JournalEntry.create({
            entryDate: new Date(),
            referenceNo: `PAY-${payroll.month}`,
            description: `قيد رواتب مفصل لشهر ${payroll.month}`,
            lines: lines,
            totalDebit: Math.max(totalDr, totalCr),
            totalCredit: Math.max(totalDr, totalCr),
            status: 'Posted'
        });

        // تحديث حالة الكشف
        payroll.status = 'Posted';
        await payroll.save();

        res.json({ message: 'تم ترحيل القيد التفصيلي بنجاح ✅' });

    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/payroll', async (req, res) => {
    try {
        const { month } = req.query;
        const filter = month ? { month } : {};
        const list = await Payroll.find(filter).sort({ month: -1 }).lean();
        res.json(list);
    } catch(e) { res.status(500).json({ message: e.message }); }
});

router.delete('/payroll/:id', async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id);
        if (!payroll) return res.status(404).json({ message: "غير موجود" });

        // استرجاع الرصيد
        for (const row of payroll.details) {
            if (row.annualLeaveDays > 0 && row.employee) {
                await Employee.updateOne(
                    { _id: row.employee },
                    { $inc: { vacationBalance: row.annualLeaveDays } }
                );
            }
        }

        await JournalEntry.deleteOne({ referenceNo: `PAY-${payroll.month}` });
        await Payroll.findByIdAndDelete(req.params.id);

        res.json({ message: "تم الحذف واسترجاع الأرصدة وإلغاء القيد" });

    } catch (err) { res.status(500).json({ message: err.message }); }
});

async function getAccount(code, name, type, nature) {
    let acc = await Account.findOne({ code: code });
    if (!acc) acc = await Account.create({ code, name, type, nature, isTransactional: true });
    return acc;
}

module.exports = router;