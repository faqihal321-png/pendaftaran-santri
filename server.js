const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- INISIALISASI FIREBASE (OTOMATIS) ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        // JALAN DI RAILWAY
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Berhasil: Terhubung ke Firebase (Mode Railway)");
    } else {
        // JALAN DI LOKAL (Pastikan file JSON ada di folder yang sama)
        const serviceAccount = require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Berhasil: Terhubung ke Firebase (Mode Lokal)");
    }
    db = admin.database();
} catch (error) {
    console.log("❌ Error Koneksi: " + error.message);
}

// --- ROUTES ---

// 1. Halaman Utama
app.get('/', (req, res) => res.redirect('/login'));

// 2. Halaman Login (Sederhana agar tidak error)
app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
            <h2>Panel Admin Pesantren</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:20px; border-radius:10px;">
                <input name="user" placeholder="Username" required style="margin-bottom:10px; padding:8px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="margin-bottom:10px; padding:8px;"><br>
                <button type="submit" style="width:100%; padding:10px; background:green; color:white; border:none; border-radius:5px;">Masuk</button>
            </form>
        </div>
    `);
});

// 3. Proses Login
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    // Ganti ini sesuai keinginan Anda
    if (user === "admin" && pass === "pesantren2026") {
        res.cookie('status_login', 'aktif', { httpOnly: true, secure: true, sameSite: 'lax' });
        return res.redirect('/admin');
    }
    res.send("Gagal Login! <a href='/login'>Coba Lagi</a>");
});

// 4. Panel Admin (Menampilkan Data)
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.status_login !== 'aktif') return res.redirect('/login');
    
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        
        let tabelData = "";
        Object.values(data).forEach(item => {
            tabelData += `<tr>
                <td style="border:1px solid #ddd; padding:8px;">${item.nama || '-'}</td>
                <td style="border:1px solid #ddd; padding:8px;">${item.email || '-'}</td>
                <td style="border:1px solid #ddd; padding:8px;">${item.whatsapp || '-'}</td>
            </tr>`;
        });

        res.send(`
            <div style="font-family:sans-serif; padding:20px;">
                <h1>Daftar Pendaftar Santri</h1>
                <table style="width:100%; border-collapse:collapse;">
                    <tr style="background:#f2f2f2;">
                        <th style="border:1px solid #ddd; padding:8px;">Nama</th>
                        <th style="border:1px solid #ddd; padding:8px;">Email</th>
                        <th style="border:1px solid #ddd; padding:8px;">WhatsApp</th>
                    </tr>
                    ${tabelData}
                </table>
                <br>
                <a href="/logout" style="color:red;">Keluar/Logout</a>
            </div>
        `);
    } catch (e) {
        res.send("Gagal mengambil data Firebase: " + e.message);
    }
});

// 5. Logout
app.get('/logout', (req, res) => {
    res.clearCookie('status_login');
    res.redirect('/login');
});

// --- MENJALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server siap di port " + PORT);
});