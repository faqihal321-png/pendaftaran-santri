const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- CONFIG ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- FIREBASE INITIALIZATION ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        const serviceAccount = JSON.parse(config);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        db = admin.database();
        console.log("✅ Firebase Connected");
    }
} catch (e) {
    console.log("❌ Firebase Error: " + e.message);
}

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
            <form action="/login" method="POST" style="border:1px solid #ccc;padding:20px;border-radius:10px;">
                <h3>Admin Login</h3>
                <input name="user" placeholder="Username" required style="display:block;margin-bottom:10px;padding:8px;">
                <input name="pass" type="password" placeholder="Password" required style="display:block;margin-bottom:10px;padding:8px;">
                <button type="submit" style="width:100%;padding:10px;background:green;color:white;border:none;cursor:pointer;">Masuk</button>
            </form>
        </body>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Gagal!'); window.location.href='/login';</script>");
});

app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');
    res.send("<h1>Panel Admin Aktif</h1><a href='/logout'>Logout</a>");
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("✅ Server Live on Port " + PORT));