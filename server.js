const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");
const path = require('path');

const app = express();

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MENGIZINKAN AKSES FILE index.html di folder public
app.use(express.static('public'));

// --- INISIALISASI FIREBASE ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
    } else {
        const serviceAccount = require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
    }
    db = admin.database();
} catch (error) {
    console.log("❌ Error Firebase: " + error.message);
}

// --- RUTE PENDAFTARAN (UNTUK SANTRI) ---

// Mengarahkan halaman utama ke index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Proses simpan data dari index.html
app.post('/simpan', async (req, res) => {
    try {
        // Mengambil data dari atribut 'name' di HTML
        const { nama, email, whatsapp } = req.body;

        // Cek apakah database sudah siap
        if (!db) {
            throw new Error("Koneksi Firebase belum siap.");
        }

        const pendaftarBaru = db.ref("pendaftar").push();
        await pendaftarBaru.set({
            nama: nama || "Tanpa Nama",
            email: email || "-",
            whatsapp: whatsapp || "-",
            waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        });

        res.send("<script>alert('Pendaftaran Berhasil!'); window.location.href='/';</script>");
        console.log("✅ Data berhasil disimpan untuk: " + nama);
    } catch (e) {
        console.log("❌ Gagal simpan ke Firebase: " + e.message);
        res.status(500).send("Gagal simpan data: " + e.message);
    }
});

// --- RUTE ADMIN (KHUSUS ADMIN) ---

app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>Admin Login</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:30px; border-radius:15px;">
                <input name="user" placeholder="Username" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <button type="submit" style="width:220px; padding:10px; background: #28a745; color:white; border:none; border-radius:5px;">Masuk</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === "admin" && pass === "pesantren2026") {
        res.cookie('admin_auth', 'session_active', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Gagal!'); window.location.href='/login';</script>");
});

app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.admin_auth !== 'session_active') return res.redirect('/login');
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        let baris = "";
        Object.keys(data).reverse().forEach(id => {
            const s = data[id];
            baris += `<tr><td style="border:1px solid #ddd; padding:10px;">${s.nama}</td><td style="border:1px solid #ddd; padding:10px;">${s.email}</td><td style="border:1px solid #ddd; padding:10px;">${s.whatsapp}</td></tr>`;
        });
        res.send(`<div style="font-family:sans-serif; padding:20px;"><h1>Data Pendaftar</h1><table style="width:100%; border-collapse:collapse;"><tr><th>Nama</th><th>Email</th><th>WA</th></tr>${baris}</table><br><a href="/logout">Logout</a></div>`);
    } catch (e) { res.send("Error"); }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server Jalan!");
});