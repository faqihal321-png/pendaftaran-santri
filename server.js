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
    const configString = process.env.FIREBASE_CONFIG;
    if (!configString) throw new Error("FIREBASE_CONFIG is missing in Railway Variables");
    
    const serviceAccount = JSON.parse(configString);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
    db = admin.database();
    console.log("✅ Firebase Connected");
} catch (e) {
    console.log("❌ Firebase Error: " + e.message);
}

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.send(`
        <form action="/login" method="POST" style="margin:50px; font-family:sans-serif;">
            <h2>Admin Login</h2>
            <input name="user" placeholder="Username" required><br><br>
            <input name="pass" type="password" placeholder="Password" required><br><br>
            <button type="submit">Masuk</button>
        </form>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { 
            maxAge: 86400000, 
            httpOnly: true, 
            secure: true, 
            sameSite: 'lax' 
        });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Gagal!'); window.location.href='/login';</script>");
});

app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');
    
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        res.send(`<h1>Panel Admin</h1><pre>${JSON.stringify(data, null, 2)}</pre><a href="/logout">Logout</a>`);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("✅ Server jalan di port " + PORT));