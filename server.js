const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- FIREBASE SETUP ---
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
    res.send('<h2>Login Admin</h2><form action="/login" method="POST"><input name="user" placeholder="User"><br><input name="pass" type="password" placeholder="Pass"><br><button type="submit">Masuk</button></form>');
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === (process.env.ADMIN_USER || "admin") && pass === (process.env.ADMIN_PASS || "pesantren2026")) {
        res.cookie('auth', 'ok', { httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("Gagal! <a href='/login'>Kembali</a>");
});

app.get('/admin', async (req, res) => {
    if (req.cookies.auth !== 'ok') return res.redirect('/login');
    try {
        const snap = await db.ref("pendaftar").once("value");
        res.send(`<h1>Data Pendaftar</h1><pre>${JSON.stringify(snap.val(), null, 2)}</pre><br><a href="/logout">Logout</a>`);
    } catch (e) { res.send("Error: " + e.message); }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth');
    res.redirect('/login');
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("✅ Server jalan di port " + PORT));