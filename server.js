const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// Middleware dasar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-psb-2026'));

// Folder upload
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// --- INISIALISASI FIREBASE (DENGAN PROTEKSI) ---
let db = null;
try {
    if (process.env.FIREBASE_CONFIG) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        db = admin.database();
        console.log("✅ Firebase Berhasil Terhubung");
    } else {
        console.error("❌ Variabel FIREBASE_CONFIG tidak ditemukan!");
    }
} catch (e) {
    console.error("❌ Error Firebase Init:", e.message);
}

// --- ROUTE LOGIN (TANPA SYARAT FIREBASE) ---
// Halaman Login
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0f2f5;">
            <form action="/login" method="POST" style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);width:300px;">
                <h3 style="text-align:center">Admin Login</h3>
                <input type="text" name="user" placeholder="Username" required style="width:100%;padding:8px;margin-bottom:10px;"><br>
                <input type="password" name="pass" placeholder="Password" required style="width:100%;padding:8px;margin-bottom:10px;"><br>
                <button type="submit" style="width:100%;padding:10px;background:#1a5928;color:white;border:none;border-radius:5px;cursor:pointer;">MASUK</button>
            </form>
        </body>
    `);
});

// Proses Login (POST)
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Login Gagal!'); window.location.href='/login';</script>");
});

// --- ADMIN PANEL ---
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');
    
    if (!db) return res.status(500).send("Database tidak siap. Cek log Railway Anda.");

    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = list.map((s, i) => `
            <tr>
                <td border="1">${i+1}</td>
                <td>${s.nama || 'Tanpa Nama'}</td>
                <td><button onclick="alert('ID: ${s.id}')">Detail</button></td>
            </tr>
        `).join('');

        res.send(`<h1>Admin Panel</h1><a href="/logout">Logout</a><br><table border="1" width="100%">${rows}</table>`);
    } catch (e) {
        res.status(500).send("Error ambil data: " + e.message);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// Root Redirect
app.get('/', (req, res) => res.redirect('/login'));

// Catch-all untuk error agar tidak layar putih polos
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Ada kesalahan di server: ' + err.message);
});

// Railway port
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log("✅ Server is running");
});