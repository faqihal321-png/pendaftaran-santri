const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- 1. SETTING DASAR ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-2026'));

// Folder uploads (buat jika tidak ada)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Akses file statis (HTML & Berkas Upload)
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

// --- 2. KONEKSI FIREBASE ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
    db = admin.database();
    console.log("✅ Firebase Terhubung");
} catch (e) {
    console.error("❌ Firebase Error:", e.message);
}

// --- 3. KONFIGURASI UPLOAD (MULTER) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage: storage });

// Input file yang diterima
const cpUpload = upload.fields([
    { name: 'foto_santri', maxCount: 1 },
    { name: 'foto_ktp_ayah', maxCount: 1 },
    { name: 'foto_ijazah', maxCount: 1 },
    { name: 'kartu_keluarga', maxCount: 1 }
]);

// --- 4. ALUR PENDAFTARAN (SIMPAN DATA) ---
app.post('/simpan', cpUpload, async (req, res) => {
    try {
        let data = { ...req.body, waktu: new Date().toLocaleString('id-ID') };

        // Masukkan nama file ke objek data jika ada file diunggah
        if (req.files) {
            Object.keys(req.files).forEach(key => {
                data[key] = req.files[key][0].filename;
            });
        }

        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Berhasil Simpan!</h2><a href='/'>Kembali</a>");
    } catch (e) {
        res.status(500).send("Gagal: " + e.message);
    }
});

// --- 5. ALUR LOGIN ADMIN ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

app.get('/login', (req, res) => {
    res.send(`
        <form action="/login" method="POST" style="margin-top:50px; text-align:center;">
            <h2>Login Admin</h2>
            <input type="text" name="user" placeholder="Username"><br><br>
            <input type="password" name="pass" placeholder="Password"><br><br>
            <button type="submit">MASUK</button>
        </form>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.user === ADMIN_USER && req.body.pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { httpOnly: true });
        res.redirect('/admin');
    } else {
        res.send("Login Gagal! <a href='/login'>Coba lagi</a>");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- 6. ALUR TAMPIL DATA (ADMIN) ---
app.get('/admin', async (req, res) => {
    // Cek Login
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');

    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const pendaftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = pendaftar.map((s, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><img src="/uploads/${s.foto_santri}" width="50"></td>
                <td>${s.nama}</td>
                <td>
                    <a href="/uploads/${s.foto_ktp_ayah}" target="_blank">KTP</a> | 
                    <a href="/uploads/${s.foto_ijazah}" target="_blank">Ijazah</a>
                </td>
            </tr>
        `).join('');

        res.send(`
            <h1>Data Pendaftar</h1>
            <a href="/logout">Logout</a>
            <table border="1" cellpadding="10" style="width:100%; margin-top:20px; border-collapse:collapse;">
                <thead>
                    <tr><th>No</th><th>Foto</th><th>Nama</th><th>Berkas</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

// --- 7. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server jalan di port " + PORT));