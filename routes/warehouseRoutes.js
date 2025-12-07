const express = require('express');
const router = express.Router();
const Warehouse = require('../models/Warehouse');
const Account = require('../models/Account');

router.post('/', async (req, res) => {
    try {
        const { name, code, parent, accountId } = req.body;
        let path = name;
        if (parent) {
            const parentNode = await Warehouse.findById(parent);
            if (parentNode) path = `${parentNode.path} > ${name}`;
        }
        const newWarehouse = await Warehouse.create({ name, code, parent, path, accountId });
        res.status(201).json(newWarehouse);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const { name, code, parent, accountId } = req.body;
        let path = name;
        if (parent) {
            const parentNode = await Warehouse.findById(parent);
            if (parentNode) path = `${parentNode.path} > ${name}`;
        }
        const updated = await Warehouse.findByIdAndUpdate(req.params.id, { name, code, parent, path, accountId }, { new: true });
        res.json(updated);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.get('/', async (req, res) => {
    try {
        const warehouses = await Warehouse.find().populate('accountId').sort({ path: 1 }).lean();
        res.json(warehouses);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/transactional', async (req, res) => {
    try {
        const all = await Warehouse.find().lean();
        const parents = all.filter(w => w.parent).map(w => w.parent.toString());
        const trans = all.filter(w => !parents.includes(w._id.toString()));
        res.json(trans);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const hasChildren = await Warehouse.findOne({ parent: req.params.id });
        if(hasChildren) return res.status(400).json({message: "لا يمكن حذف مخزن أب"});
        await Warehouse.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;