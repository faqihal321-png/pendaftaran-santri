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

// --- 2. FIREBASE (DENGAN PROTEKSI ERROR) ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
    db = admin.database();
    console.log("✅ Firebase Connected");
} catch (e) {
    console.error("❌ Firebase Error: Periksa FIREBASE_CONFIG di Railway!", e.message);
}

// --- 3. KEAMANAN LOGIN (SANGAT STABIL) ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

function checkAuth(req, res, next) {
    // Menambahkan pengecekan apakah cookie auth_status ada
    if (req.cookies && req.cookies.auth_status === 'logged_in') {
        return next();
    }
    console.log("Akses ditolak, mengalihkan ke login...");
    res.redirect('/login');
}

// --- 4. ROUTES LOGIN & LOGOUT ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#eee;">
            <form action="/login" method="POST" style="background:white; padding:30px; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.1); width:300px;">
                <h2 style="text-align:center;">Login Admin</h2>
                <input type="text" name="user" placeholder="Username" required style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px;"><br>
                <input type="password" name="pass" placeholder="Password" required style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px;"><br>
                <button type="submit" style="width:100%; padding:10px; background:#1a5928; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">MASUK</button>
            </form>
        </body>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        // Path '/' memastikan cookie bisa dibaca di semua rute halaman
        res.cookie('auth_status', 'logged_in', { 
            maxAge: 86400000, 
            httpOnly: true,
            path: '/' 
        });
        console.log("✅ Login Sukses, Mengalihkan...");
        res.redirect('/admin');
    } else {
        res.send("<script>alert('Username/Password Salah!'); window.location.href='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status', { path: '/' });
    res.redirect('/login');
});

// --- 5. ROUTES DATA ---
app.get('/admin', checkAuth, async (req, res) => {
    try {
        if (!db) throw new Error("Database tidak terhubung!");
        
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const daftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = daftar.map((s, i) => `
            <tr>
                <td style="padding:10px; text-align:center; border-bottom:1px solid #ddd;">${i + 1}</td>
                <td style="padding:10px; text-align:center; border-bottom:1px solid #ddd;"><img src="/uploads/${s.foto_santri}" width="50" style="border-radius:5px;" onerror="this.src='https://via.placeholder.com/50'"></td>
                <td style="padding:10px; border-bottom:1px solid #ddd;"><b>${s.nama}</b></td>
                <td style="padding:10px; border-bottom:1px solid #ddd;">${s.sekolah_tujuan || '-'}</td>
                <td style="padding:10px; text-align:center; border-bottom:1px solid #ddd;"><a href="https://wa.me/${s.whatsapp_orangtua}" target="_blank" style="text-decoration:none; color:green; font-weight:bold;">📱 WA</a></td>
            </tr>
        `).join('');

        res.send(`
            <body style="font-family:sans-serif; padding:20px; background:#f4f7f6;">
                <div style="max-width:900px; margin:auto; background:white; padding:20px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h1>Data Santri Terdaftar</h1>
                        <div>
                            <a href="/" style="text-decoration:none; color:blue;">Depan</a> | 
                            <a href="/logout" style="text-decoration:none; color:red; font-weight:bold;">Keluar</a>
                        </div>
                    </div>
                    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                        <tr style="background:#1a5928; color:white;">
                            <th style="padding:12px;">No</th><th style="padding:12px;">Foto</th><th style="padding:12px; text-align:left;">Nama</th><th style="padding:12px; text-align:left;">Tujuan</th><th style="padding:12px;">Aksi</th>
                        </tr>
                        ${rows || '<tr><td colspan="5" style="text-align:center; padding:20px;">Belum ada data pendaftar.</td></tr>'}
                    </table>
                </div>
            </body>
        `);
    } catch (e) {
        res.status(500).send("Gagal Memuat Data: " + e.message + ". Pastikan FIREBASE_CONFIG di Railway sudah benar!");
    }
});

// --- 6. ROUTE PENDAFTARAN ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const upload = multer({ dest: 'uploads/' });
const cpUpload = upload.fields([{ name: 'foto_ktp_ayah' }, { name: 'foto_ijazah' }, { name: 'foto_santri' }, { name: 'kartu_keluarga' }]);

app.post('/simpan', cpUpload, async (req, res) => {
    try {
        const data = { ...req.body, waktu: new Date().toLocaleString() };
        if (req.files && req.files['foto_santri']) data.foto_santri = req.files['foto_santri'][0].filename;
        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Berhasil Daftar!</h2><a href='/'>Kembali ke Form</a>");
    } catch (e) { res.status(500).send("Gagal: " + e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`✅ Server Aktif di Port ${PORT}`); });