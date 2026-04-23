const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- KONEKSI FIREBASE ---
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
        console.log("✅ Firebase Terhubung");
    }
} catch (e) {
    console.log("❌ Firebase Error: " + e.message);
}

// --- HALAMAN LOGIN ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.send(`
        <form action="/login" method="POST" style="margin:50px;">
            <h2>Login Admin</h2>
            <input name="user" placeholder="Username"><br><br>
            <input name="pass" type="password" placeholder="Password"><br><br>
            <button type="submit">Masuk</button>
        </form>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    // Password default jika belum diatur di Railway
    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("Login Gagal! <a href='/login'>Coba lagi</a>");
});

// --- HALAMAN DATA (ADMIN) ---
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');
    
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        
        let html = "<h1>Data Pendaftar</h1><table border='1'><tr><th>Nama</th><th>Email</th></tr>";
        Object.values(data).forEach(s => {
            html += `<tr><td>${s.nama || '-'}</td><td>${s.email || '-'}</td></tr>`;
        });
        html += "</table><br><a href='/logout'>Logout</a>";
        res.send(html);
    } catch (e) {
        res.send("Gagal ambil data: " + e.message);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("✅ Server Aktif di Port " + PORT));