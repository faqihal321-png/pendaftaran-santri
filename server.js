const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- INISIALISASI FIREBASE ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        // Mode Railway (Membaca dari Environment Variable)
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Terhubung ke Firebase (Mode Railway)");
    } else {
        // Mode Lokal (Membaca dari file serviceAccountKey.json)
        const serviceAccount = require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Terhubung ke Firebase (Mode Lokal)");
    }
    db = admin.database();
} catch (error) {
    console.log("❌ Error Koneksi: " + error.message);
}

// --- RUTE HALAMAN (ROUTES) ---

// 1. Halaman Utama (Sekarang otomatis pindah ke login)
app.get('/', (req, res) => {
    res.redirect('/login');
});

// 2. Halaman Login
app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>Admin Login - PSB</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:30px; border-radius:15px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <input name="user" placeholder="Username" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <button type="submit" style="width:220px; padding:10px; background: #28a745; color:white; border:none; border-radius:5px; cursor:pointer;">Masuk</button>
            </form>
        </div>
    `);
});

// 3. Proses Login
app.post('/login', (req, res) => {
    const { user, pass } = req.body;

    if (user === "admin" && pass === "pesantren2026") {
        // Pengaturan Cookie yang aman untuk Railway & Safari
        res.cookie('admin_auth', 'session_active', {
            httpOnly: true,
            secure: true,      // Wajib true untuk HTTPS di Railway
            sameSite: 'none',  // Membantu Safari menerima cookie lintas domain
            maxAge: 24 * 60 * 60 * 1000 // Berlaku 1 hari
        });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Login Gagal!'); window.location.href='/login';</script>");
});

// 4. Halaman Data (Admin)
app.get('/admin', async (req, res) => {
    // Cek apakah sudah login
    if (!req.cookies || req.cookies.admin_auth !== 'session_active') {
        return res.redirect('/login');
    }

    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        
        let barisTabel = "";
        Object.keys(data).forEach(id => {
            const santri = data[id];
            barisTabel += `
                <tr>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.nama || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.email || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.whatsapp || '-'}</td>
                </tr>`;
        });

        res.send(`
            <div style="font-family:sans-serif; padding:40px;">
                <h1>Data Calon Santri</h1>
                <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <thead>
                        <tr style="background:#f8f9fa; text-align:left;">
                            <th style="border:1px solid #ddd; padding:12px;">Nama</th>
                            <th style="border:1px solid #ddd; padding:12px;">Email</th>
                            <th style="border:1px solid #ddd; padding:12px;">WhatsApp</th>
                        </tr>
                    </thead>
                    <tbody>${barisTabel}</tbody>
                </table>
                <br>
                <a href="/logout" style="color:red; text-decoration:none;">[ Logout ]</a>
            </div>
        `);
    } catch (e) {
        res.send("Error Database: " + e.message);
    }
});

// 5. Logout
app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/login');
});

// --- MENJALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server Berjalan!");
    console.log("👉 Buka di browser: http://localhost:" + PORT);
});