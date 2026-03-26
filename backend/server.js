require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ 
    origin: ['https://store-repo-sigma.vercel.app', 'http://localhost:8000', 'http://127.0.0.1:8000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// MongoDB Atlas Connection
mongoose.connect(process.env.DATABASE_URI)
  .then(() => console.log("✅ Securely connected to MongoDB Atlas!"))
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

// MOCK Products Database (for Catalog view)
let products = [
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

app.get('/api/products', (req, res) => res.json(products));

// Authentication Routes
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, usn, pwd, refCode } = req.body;
        
        const existingUser = await User.findOne({ $or: [{ email }, { usn }] });
        if (existingUser) return res.status(400).json({ error: "USN or Email already registered!" });
        
        let initialPoints = 50;
        let refUsed = null;
        if (refCode) {
            const referrer = await User.findOne({ referralCode: refCode });
            if (referrer) {
                initialPoints += 25;
                referrer.points += 50;
                await referrer.save();
                refUsed = refCode;
            } else {
                return res.status(400).json({ error: "Invalid referral code." });
            }
        }
        
        const referralCode = name.substring(0, 4).toUpperCase().replace(/\s/g, '') + Math.floor(100 + Math.random() * 900);
        
        const newUser = new User({ name, email, usn, pwd, role: "student", points: initialPoints, referralCode, refUsed });
        await newUser.save();
        
        const userObj = newUser.toObject();
        delete userObj.pwd;
        
        res.json({ message: "Signup successful in MongoDB! Welcome.", user: userObj });
    } catch (err) {
        res.status(500).json({ error: "Backend Database Server Error" });
    }
});

app.post('/api/login', async (req, res) => {
    const { loginId, pwd } = req.body;
    
    // Support Admin Manual Login
    if (loginId === 'admin@college.edu' || loginId === 'admin') {
        if (pwd === 'admin') {
            return res.json({ 
                message: "Admin Login Successful!", 
                user: { name: "Admin Manager", email: "admin@college.edu", usn: "admin", role: "admin", points: 0, referralCode: "ADMIN", refUsed: null } 
            });
        }
    }
    
    try {
        const user = await User.findOne({ $or: [{ email: loginId }, { usn: loginId }] }).select('+pwd');
        if (!user || user.pwd !== pwd) return res.status(400).json({ error: "Invalid credentials! Check your Email/USN and Password." });
        
        const userObj = user.toObject();
        delete userObj.pwd;
        res.json({ message: "Login strictly verified by MongoDB!", user: userObj });
    } catch(err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running magically on port ${PORT}`));
