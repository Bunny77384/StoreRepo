const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000; // Render will dynamically inject PORT

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors({
    origin: 'https://store-repo-sigma.vercel.app', // For development. Change to your Vercel URL in production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Mock Database (Moving the array from script.js here!)
let products = [
    { id: 1, name: "Blue Book (60 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 150, img: "📖" },
    { id: 2, name: "Pink Book (40 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 200, img: "📕" },
    { id: 3, name: "Graph Sheets (10 Pcs)", price: 10, category: "Stationery", branch: "All", semester: "All", stock: 50, img: "📉" }
];

// --- Routes ---
// Root Welcome Route
app.get('/', (req, res) => {
    res.json({ message: "Store Backend API is Live!" });
});

// Get Products Route
app.get('/api/products', (req, res) => {
    res.json(products);
});

// Update Product Stock (Example of POST logic)
app.post('/api/purchase', (req, res) => {
    const { productId, qty } = req.body;
    const product = products.find(p => p.id === productId);

    if (!product || product.stock < qty) {
        return res.status(400).json({ error: "Invalid product or insufficient stock" });
    }

    product.stock -= qty;
    res.json({ message: "Purchase successful", remainingStock: product.stock });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Backend server magically running on http://localhost:${PORT}`);
});
