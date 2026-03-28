require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// MongoDB Atlas Connection
mongoose.connect(process.env.DATABASE_URI)
    .then(() => console.log("✅ Securely connected!"))
    .catch(err => console.error("❌ Database connection failed:", err));

// MongoDB Schema Definitions
const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    usn: String,
    pwd: { type: String, select: false },
    role: { type: String, default: 'student' },
    points: { type: Number, default: 50 },
    referralCode: String,
    refUsed: String
});
const User = mongoose.model('User', UserSchema);

const OrderSchema = new mongoose.Schema({
    id: String,
    userId: String,
    userName: String,
    usn: String,
    items: Array,
    total: Number,
    date: String,
    slot: String,
    points: Number,
    status: String
});
const Order = mongoose.model('Order', OrderSchema);

const NotificationSchema = new mongoose.Schema({
    id: String,
    userId: String,
    title: String,
    desc: String,
    unread: { type: Boolean, default: true },
    timestamp: String,
    alertStr: String
});
const Notification = mongoose.model('Notification', NotificationSchema);

const PrintSchema = new mongoose.Schema({
    id: String,
    userId: String,
    fileName: String,
    pages: String,
    copies: String,
    format: String,
    status: String,
    date: String
});
const PrintRequest = mongoose.model('PrintRequest', PrintSchema);

const ProductSchema = new mongoose.Schema({
    id: Number,
    name: String,
    price: Number,
    category: String,
    branch: String,
    semester: String,
    stock: { type: Number, default: 0 },
    img: String
});
const Product = mongoose.model('Product', ProductSchema);

const SaleAnalyticsSchema = new mongoose.Schema({
    productId: Number,
    productName: String,
    quantitySold: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
});
const SaleAnalytics = mongoose.model('SaleAnalytics', SaleAnalyticsSchema);

const RedeemTransactionSchema = new mongoose.Schema({
    orderId: String,
    userId: String,
    userName: String,
    productNames: [String],
    discountAmount: Number,
    finalPrice: Number,
    date: { type: Date, default: Date.now }
});
const RedeemTransaction = mongoose.model('RedeemTransaction', RedeemTransactionSchema);

const DailyReportSchema = new mongoose.Schema({
    date: String,
    totalRevenue: Number,
    totalOrders: Number,
    soldProducts: Array,
    remainingStock: Array,
    redeemDiscounts: Number,
    cancelledOrders: Number
});
const DailyReport = mongoose.model('DailyReport', DailyReportSchema);

// Initialize products in DB if empty (One-time migration)
async function seedProducts() {
    const count = await Product.countDocuments();
    if (count === 0) {
        const initialProducts = [
            { id: 1, name: "Blue Book (60 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 150, img: "📖" },
            { id: 2, name: "Pink Book (40 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 200, img: "📕" },
            { id: 3, name: "Graph Sheets (10 Pcs)", price: 10, category: "Stationery", branch: "All", semester: "All", stock: 50, img: "📉" },
            { id: 4, name: "Record Book", price: 80, category: "Lab", branch: "All", semester: "All", stock: 0, img: "📓" },
            { id: 5, name: "Engineering Drawing Kit", price: 450, category: "Kits", branch: "MECH", semester: "1", stock: 15, img: "📐" },
            { id: 6, name: "Microprocessor Lab Manual", price: 120, category: "Lab", branch: "CSE", semester: "5", stock: 0, img: "📘" },
            { id: 7, name: "Scientific Calculator", price: 950, category: "Electronics", branch: "All", semester: "1", stock: 10, img: "🧮" },
            { id: 8, name: "Blue Ball Pen (Set of 5)", price: 50, category: "Stationery", branch: "All", semester: "All", stock: 100, img: "🖊️" },
            { id: 9, name: "A4 Project Paper (100 Pcs)", price: 120, category: "Stationery", branch: "All", semester: "All", stock: 80, img: "📄" },
            { id: 10, name: "DS Lab Manual + Eval Copy", price: 150, category: "Combo", branch: "CSE", semester: "3", stock: 100, img: "📚" },
            { id: 11, name: "VLSI Lab Manual + Eval Copy", price: 160, category: "Combo", branch: "ECE", semester: "6", stock: 50, img: "📜" },
            { id: 12, name: "Fluid Mechanics Manual + Eval", price: 140, category: "Combo", branch: "MECH", semester: "4", stock: 40, img: "🛠️" }
        ];
        await Product.insertMany(initialProducts);
        console.log("🌱 Products seeded!");
    }
}
seedProducts();

app.get('/api/products', async (req, res) => {
    try {
        const prodList = await Product.find({}).sort({ id: 1 });
        res.json(prodList);
    } catch (err) { res.status(500).json({ error: "Fetch products failed" }); }
});

app.post('/api/products/restock', async (req, res) => {
    try {
        const { id, amount } = req.body;
        const prod = await Product.findOneAndUpdate({ id }, { $inc: { stock: amount } }, { new: true });
        res.json({ success: true, product: prod });
    } catch (err) { res.status(500).json({ error: "Restock failed" }); }
});

const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

// --- Helper for Sales Analytics ---
async function trackSale(item, orderDate) {
    const productId = item.id;
    const qty = item.qty;
    const revenue = item.price * qty;

    await SaleAnalytics.findOneAndUpdate(
        { productId, date: { $gte: new Date().setHours(0,0,0,0) } }, // Daily tracking
        { 
            $inc: { quantitySold: qty, revenue: revenue },
            $setOnInsert: { productName: item.name, productId }
        },
        { upsert: true, new: true }
    );

    // Atomically deduct stock from Product database
    await Product.findOneAndUpdate({ id: productId }, { $inc: { stock: -qty } });
}

// --- Automated Daily Reports @ 7:00 PM ---
// Trigger this logic manually for the user via /api/admin/force-report for testing!
async function generateDailyReport() {
    const today = new Date().toLocaleDateString();
    
    const orders = await Order.find({ date: { $regex: today.split(',')[0] } });
    const totalSales = orders.reduce((sum, o) => sum + (o.status === 'Cancelled' ? 0 : o.total), 0);
    const totalOrders = orders.length;
    const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
    
    const soldList = await SaleAnalytics.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
    const stockList = await Product.find({}, 'name stock');
    const redemptions = await RedeemTransaction.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
    const totalRedeems = redemptions.reduce((sum, r) => sum + r.discountAmount, 0);

    const report = new DailyReport({
        date: today,
        totalRevenue: totalSales,
        totalOrders,
        soldProducts: soldList,
        remainingStock: stockList,
        redeemDiscounts: totalRedeems,
        cancelledOrders: cancelledCount
    });

    await report.save();
    console.log(`📊 Daily Report for ${today} generated successfully.`);
    return report;
}

// Cron: At 19:00 (7 PM)
cron.schedule('0 19 * * *', () => {
    generateDailyReport();
});

// --- API Implementation ---

app.get('/api/admin/analytics', async (req, res) => {
    try {
        const sold = await SaleAnalytics.find({});
        const redeems = await RedeemTransaction.find({});
        const totalSales = sold.reduce((s, i) => s + i.revenue, 0);
        res.json({ sold, redeems, totalSales });
    } catch(err) { res.status(500).json({ error: "Analytics failed" }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        const newOrder = new Order(orderData);
        await newOrder.save();

        // Process inventory and analytics for each item
        for (const item of orderData.items) {
            await trackSale(item, orderData.date);
        }

        // Handle redemption tracking if present
        if (orderData.redeemedPoints) {
            const rt = new RedeemTransaction({
                orderId: orderData.id,
                userId: orderData.userId,
                userName: orderData.userName,
                productNames: orderData.items.map(i => i.name),
                discountAmount: 30, // Fixed redemption value context from frontend
                finalPrice: orderData.total
            });
            await rt.save();
        }

        res.json({ success: true, order: newOrder });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: "Order failed to initialize securely" }); 
    }
});

app.put('/api/orders/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const existing = await Order.findOne({ id: req.params.id });
        
        if (status === 'Cancelled' && existing.status !== 'Cancelled') {
            for (const item of existing.items) {
                await Product.findOneAndUpdate({ id: item.id }, { $inc: { stock: item.qty } });
            }
        }
        await Order.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Sync state update failed" }); }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find({});
        res.json(orders);
    } catch (err) { res.status(500).json({ error: "Fetch orders failed" }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-pwd');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

app.post('/api/update-points', async (req, res) => {
    try {
        const { email, points } = req.body;
        await User.findOneAndUpdate({ email }, { points: points });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to sync points" }); }
});

app.get('/api/notifications', async (req, res) => {
    try {
        const notifs = await Notification.find({});
        res.json(notifs);
    } catch (err) { res.status(500).json({ error: "Fetch notifs failed" }); }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const newNotif = new Notification(req.body);
        await newNotif.save();
        res.json({ success: true, notification: newNotif });
    } catch (err) { res.status(500).json({ error: "Create notif failed" }); }
});

app.put('/api/notifications/:id', async (req, res) => {
    try {
        await Notification.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update notif failed" }); }
});

app.get('/api/prints', async (req, res) => {
    try {
        const prints = await PrintRequest.find({});
        res.json(prints);
    } catch (err) { res.status(500).json({ error: "Fetch prints failed" }); }
});

app.post('/api/prints', async (req, res) => {
    try {
        const newPrint = new PrintRequest(req.body);
        await newPrint.save();
        res.json({ success: true, print: newPrint });
    } catch (err) { res.status(500).json({ error: "Create print failed" }); }
});

app.put('/api/prints/:id', async (req, res) => {
    try {
        await PrintRequest.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update print failed" }); }
});

// --- Report Downloads ---

app.get('/api/admin/reports/csv', async (req, res) => {
    let reports = await DailyReport.find({});
    if (reports.length === 0) {
        await generateDailyReport(); // Auto-generate if empty
        reports = await DailyReport.find({});
    }
    const filePath = path.join(__dirname, 'daily_analytics.csv');
    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [
            { id: 'date', title: 'Date' },
            { id: 'totalRevenue', title: 'Revenue' },
            { id: 'totalOrders', title: 'Orders' },
            { id: 'cancelledOrders', title: 'Cancelled' }
        ]
    });
    
    await csvWriter.writeRecords(reports);
    res.download(filePath, () => { if(fs.existsSync(filePath)) fs.unlinkSync(filePath); });
});

app.get('/api/admin/reports/pdf', async (req, res) => {
    let reports = await DailyReport.find({});
    if (reports.length === 0) {
        await generateDailyReport();
        reports = await DailyReport.find({});
    }
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.fontSize(20).text('Monthly Sales Hub Report', { align: 'center' });
    doc.moveDown();
    reports.forEach(r => {
        doc.fontSize(12).text(`Date: ${r.date} | Revenue: ₹${r.totalRevenue} | Orders: ${r.totalOrders}`);
    });
    doc.end();
});

// Force generate a report for immediate validation
app.post('/api/admin/force-report', async (req, res) => {
    const report = await generateDailyReport();
    res.json({ success: true, report });
});

// Auth Routes... (rest of the file as is)
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, usn, pwd, refCode } = req.body;
        const existingUser = await User.findOne({ $or: [{ email }, { usn }] });
        if (existingUser) return res.status(400).json({ error: "USN already used." });
        
        const referralCode = name.substring(0, 4).toUpperCase() + Math.floor(100+Math.random()*900);
        const newUser = new User({ name, email, usn, pwd, role: "student", points: 50, referralCode });
        await newUser.save();
        res.json({ message: "Signup success", user: newUser });
    } catch(err) { res.status(500).json({ error: "DB Error" }); }
});

app.post('/api/login', async (req, res) => {
    const { loginId, pwd } = req.body;
    if (loginId === 'admin' || loginId === 'admin@college.edu') {
        if (pwd === 'admin') return res.json({ user: { name: "Admin", email: "admin@college.edu", role: "admin" } });
    }
    const user = await User.findOne({ $or: [{ email: loginId }, { usn: loginId }] }).select('+pwd');
    if (!user || user.pwd !== pwd) return res.status(400).json({ error: "Invalid" });
    const uObj = user.toObject(); delete uObj.pwd;
    res.json({ user: uObj });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Secure sync active on port ${PORT}`));
