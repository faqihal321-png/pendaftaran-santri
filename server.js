const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- 1. CONFIGURATION ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- 2. FIREBASE INITIALIZATION ---
let db;
try {
    const configString = process.env.FIREBASE_CONFIG;
    if (configString) {
        const serviceAccount = JSON.parse(configString);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        db = admin.database();
        console.log("✅ Firebase Berhasil Terhubung");
    } else {
        console.log("⚠️ FIREBASE_CONFIG tidak ditemukan");
    }
} catch (e) {
    console.log("❌ Firebase Error: " + e.message);
}

// --- 3. ROUTES ---

// Halaman Utama
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Form Login
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f4f4f4;">
            <form action="/login" method="POST" style="background:white;padding:30px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);width:300px;">
                <h3 style="text-align:center;margin-top:0;">Admin Login</h3>
                <input type="text" name="user" placeholder="Username" required style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #ccc;"><br>
                <input type="password" name="pass" placeholder="Password" required style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #ccc;"><br>
                <button type="submit" style="width:100%;padding:10px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;">Masuk</button>
            </form>
        </body>
    `);
});

// Proses Login
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        // Gunakan secure: true karena Railway pakai HTTPS
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Gagal! Periksa User & Pass'); window.location.href='/login';</script>");
});

// Panel Admin
app.get('/admin', (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') {
        return res.redirect('/login');
    }
    res.send(`
        <div style="padding:20px;font-family:sans-serif;">
            <h1>✅ Panel Admin Aktif</h1>
            <p>Selamat datang! Anda berhasil login.</p>
            <a href="/logout" style="color:red;">Keluar</a>
        </div>
    `);
});

// Logout
app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- 4. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("✅ Server siap di port " + PORT);
});