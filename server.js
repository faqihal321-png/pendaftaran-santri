const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const admin = require("firebase-admin");

const app = express();

// --- 1. KONFIGURASI DASAR ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-pesantren-2026'));

if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// --- 2. FIREBASE ---
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
});
const db = admin.database();

// --- 3. KEAMANAN LOGIN (SANGAT STABIL) ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

// Fungsi pengecekan akses
function checkAuth(req, res, next) {
    if (req.cookies.auth_status === 'logged_in') {
        return next();
    }
    res.redirect('/login');
}

// --- 4. ROUTES LOGIN & LOGOUT ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#eee;">
            <form action="/login" method="POST" style="background:white; padding:30px; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.1);">
                <h2>Login Admin</h2>
                <input type="text" name="user" placeholder="Username" required style="width:100%; padding:10px; margin-bottom:10px;"><br>
                <input type="password" name="pass" placeholder="Password" required style="width:100%; padding:10px; margin-bottom:10px;"><br>
                <button type="submit" style="width:100%; padding:10px; background:green; color:white; border:none; cursor:pointer;">MASUK</button>
            </form>
        </body>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        // Simpan cookie di browser selama 1 hari
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true });
        res.redirect('/admin');
    } else {
        res.send("Gagal! <a href='/login'>Ulangi</a>");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// --- 5. ROUTES DATA (INI YANG ANDA BUTUHKAN) ---
app.get('/admin', checkAuth, async (req, res) => {
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const daftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = daftar.map((s, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><img src="/uploads/${s.foto_santri}" width="50" onerror="this.src='https://via.placeholder.com/50'"></td>
                <td>${s.nama}</td>
                <td>${s.sekolah_tujuan}</td>
                <td><a href="https://wa.me/${s.whatsapp_orangtua}" target="_blank">Chat WA</a></td>
            </tr>
        `).join('');

        res.send(`
            <body style="font-family:sans-serif; padding:20px;">
                <h1>Data Santri Terdaftar</h1>
                <a href="/logout" style="color:red;">Keluar</a> | <a href="/">Halaman Depan</a>
                <table border="1" style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <tr style="background:#ddd;">
                        <th>No</th><th>Foto</th><th>Nama</th><th>Tujuan</th><th>WA</th>
                    </tr>
                    ${rows || '<tr><td colspan="5">Belum ada data pendaftar.</td></tr>'}
                </table>
            </body>
        `);
    } catch (e) {
        res.send("Firebase Error: " + e.message);
    }
});

// --- 6. ROUTE PENDAFTARAN (AGAR FORM TETAP JALAN) ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const upload = multer({ dest: 'uploads/' });
const cpUpload = upload.fields([{ name: 'foto_ktp_ayah' }, { name: 'foto_ijazah' }, { name: 'foto_santri' }, { name: 'kartu_keluarga' }]);

app.post('/simpan', cpUpload, async (req, res) => {
    try {
        const data = { ...req.body, waktu: new Date().toLocaleString() };
        if (req.files['foto_santri']) data.foto_santri = req.files['foto_santri'][0].filename;
        await db.ref("pendaftar").push(data);
        res.send("Berhasil! <a href='/'>Kembali</a>");
    } catch (e) { res.send("Gagal: " + e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server Aktif!"); });