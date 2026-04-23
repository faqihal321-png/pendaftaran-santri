const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- INISIALISASI FIREBASE ---
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
        console.log("✅ Firebase Berhasil Terhubung");
    } else {
        console.log("⚠️ Peringatan: FIREBASE_CONFIG tidak ditemukan di Variables");
    }
} catch (error) {
    console.log("❌ Firebase Error: " + error.message);
}

// --- PENGATURAN ROUTE ---

// 1. Halaman Utama -> Lempar ke Login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// 2. Tampilan Form Login
app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>Admin Login</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:20px; border-radius:8px;">
                <input name="user" placeholder="Username" required style="display:block; margin-bottom:10px; padding:8px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="display:block; margin-bottom:10px; padding:8px;"><br>
                <button type="submit" style="width:100%; padding:10px; background-color:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">Masuk</button>
            </form>
        </div>
    `);
});

// 3. Proses Login
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
    res.send("<script>alert('User/Pass Salah!'); window.location.href='/login';</script>");
});

// 4. Panel Admin (Hanya bisa dibuka jika sudah login)
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') {
        return res.redirect('/login');
    }
    
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        
        let rows = "";
        Object.keys(data).forEach(id => {
            const p = data[id];
            rows += `<tr>
                <td style="padding:8px; border:1px solid #ddd;">${p.nama || '-'}</td>
                <td style="padding:8px; border:1px solid #ddd;">${p.email || '-'}</td>
                <td style="padding:8px; border:1px solid #ddd;">${p.whatsapp || '-'}</td>
            </tr>`;
        });

        res.send(`
            <div style="font-family:sans-serif; padding:20px;">
                <h1>Panel Data Pendaftar</h1>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background-color:#f2f2f2;">
                            <th style="padding:8px; border:1px solid #ddd;">Nama</th>
                            <th style="padding:8px; border:1px solid #ddd;">Email</th>
                            <th style="padding:8px; border:1px solid #ddd;">WhatsApp</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <br>
                <a href="/logout" style="color:red;">Logout</a>
            </div>
        `);
    } catch (e) {
        res.status(500).send("Gagal memuat data: " + e.message);
    }
});

// 5. Logout
app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- MENJALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("✅ Server sudah menyala di port " + PORT);
});