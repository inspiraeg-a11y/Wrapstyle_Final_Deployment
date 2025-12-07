const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');

// 1. عرض كل القيود (للقائمة الخارجية)
router.get('/', async (req, res) => {
    try {
        const entries = await JournalEntry.find()
            .select('entryDate referenceNo description totalDebit totalCredit status')
            .sort({ entryDate: -1, createdAt: -1 })
            .lean();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. جلب قيد واحد بالتفصيل (مع استنتاج الأب وجلب الشرح) 🔥
router.get('/:id', async (req, res) => {
    try {
        // أ) نجيب القيد ونعمل populate للحساب
        const entry = await JournalEntry.findById(req.params.id)
            .populate('lines.accountId') 
            .lean();
            
        if (!entry) return res.status(404).json({ message: "القيد غير موجود" });

        // ب) نجمع أكواد الحسابات الرئيسية المطلوبة (سواء محفوظة أو مستنتجة)
        const parentCodes = [];
        
        entry.lines.forEach(line => {
            if (line.accountId) {
                // 1. لو الحساب فيه أب مسجل، ناخده
                if (line.accountId.parentId) {
                    parentCodes.push(line.accountId.parentId);
                } 
                // 2. لو مفيش، نحاول نستنتج الأب من شكل الكود
                else if (line.accountId.code) {
                    const code = line.accountId.code;
                    if (code.includes('-')) {
                        // حالة الفروع (1200-001) -> الأب هو ما قبل الشرطة (1200)
                        parentCodes.push(code.split('-')[0]);
                    } else if (code.length >= 4) {
                        // حالة الشجرة (5105) -> الأب هو أول رقمين (51)
                        // أو (2200) -> الأب (22)
                        parentCodes.push(code.substring(0, 2));
                    }
                }
            }
        });

        // ج) نجيب أسماء الآباء دي من الداتابيز
        const uniqueParents = [...new Set(parentCodes)];
        const parentsDB = await Account.find({ code: { $in: uniqueParents } }).lean();
        
        const parentsMap = {};
        parentsDB.forEach(p => parentsMap[p.code] = p.name);

        // د) نركب البيانات في الجدول
        const enhancedLines = entry.lines.map(line => {
            let accountCode = '-';
            let subAccountName = line.accountName || 'غير معروف';
            let mainAccountName = '-';

            if (line.accountId) {
                accountCode = line.accountId.code;
                // الاسم الفرعي يفضل اللي جاي من القيد (عشان لو فيه تفاصيل زي اسم المورد)، لو مفيش ناخد من الشجرة
                subAccountName = line.accountName || line.accountId.name; 

                // محاولة تحديد كود الأب
                let parentCode = line.accountId.parentId;
                if (!parentCode) {
                    // نفس منطق الاستنتاج
                    if (accountCode.includes('-')) parentCode = accountCode.split('-')[0];
                    else if (accountCode.length >= 4) parentCode = accountCode.substring(0, 2);
                }

                // لو لقينا اسم للأب ده، نعرضه
                if (parentCode && parentsMap[parentCode]) {
                    mainAccountName = parentsMap[parentCode];
                }
            }

            return {
                ...line,
                accountCode: accountCode,       
                mainAccountName: mainAccountName, // ده الحساب الرئيسي (اللي كان ناقص)
                subAccountName: subAccountName,   // ده الحساب الفرعي
                description: line.description || '-' // ده الشرح الفرعي (اللي كان ناقص)
            };
        });

        res.json({ ...entry, lines: enhancedLines });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// 3. إضافة قيد يدوي
router.post('/', async (req, res) => {
    try {
        const { description, lines, entryDate, referenceNo } = req.body;
        let totalDebit = 0;
        let totalCredit = 0;

        lines.forEach(line => {
            totalDebit += parseFloat(line.debit || 0);
            totalCredit += parseFloat(line.credit || 0);
        });

        if (Math.abs(totalDebit - totalCredit) > 0.1) {
            return res.status(400).json({ 
                message: `القيد غير متزن! الفرق: ${(totalDebit - totalCredit).toFixed(2)}` 
            });
        }

        const finalSerial = referenceNo || ('MAN-' + Math.floor(Date.now() / 1000));

        const newEntry = new JournalEntry({
            description,
            entryDate,
            referenceNo: finalSerial,
            lines,
            totalDebit,
            totalCredit,
            status: 'Posted'
        });

        await newEntry.save();
        res.status(201).json(newEntry);

    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;