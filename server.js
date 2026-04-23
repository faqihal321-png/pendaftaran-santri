const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- DATABASE ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        db = admin.database();
        console.log("✅ Database OK");
    }
} catch (e) { console.log("❌ DB Error: " + e.message); }

// --- LOGIN ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.send('<form action="/login" method="POST"><h2>Admin</h2><input name="user"><input name="pass" type="password"><button>Login</button></form>');
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === "admin" && pass === "pesantren2026") {
        res.cookie('auth', 'yes', { httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("Gagal!");
});

// --- LIHAT DATA ---
app.get('/admin', async (req, res) => {
    if (req.cookies.auth !== 'yes') return res.redirect('/login');
    try {
        const snap = await db.ref("pendaftar").once("value");
        res.send(`<h1>Data Santri</h1><pre>${JSON.stringify(snap.val(), null, 2)}</pre>`);
    } catch (e) { res.send("Error: " + e.message); }
});

// --- SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("🚀 Server Nyala!"));