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
                <td class="text-center fw-bold">${i + 1}</td>
                <td class="text-center">
                    <img src="/uploads/${s.foto_santri}" class="img-thumbnail shadow-sm" style="width:60px; height:70px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/60x70?text=No+Photo'">
                </td>
                <td>
                    <div class="fw-bold text-dark">${s.nama}</div>
                    <small class="text-muted"><i class="bi bi-card-text"></i> NIK: ${s.nik || '-'}</small>
                </td>
                <td>
                    <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3">
                        ${s.sekolah_tujuan || '-'}
                    </span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <a href="https://wa.me/${s.whatsapp_orangtua}" target="_blank" class="btn btn-outline-success" title="Hubungi WA">
                            <i class="bi bi-whatsapp"></i> WA
                        </a>
                        <button class="btn btn-outline-primary" onclick="showDetail('${s.id}')" title="Detail Lengkap">
                            <i class="bi bi-eye"></i> Detail
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Panel - PSB Pesantren</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
                <link rel="stylesheet" href="https://cdn.datatables.net/1.13.4/css/dataTables.bootstrap5.min.css">
                <style>
                    body { background: #f0f4f8; font-family: 'Inter', sans-serif; }
                    .navbar { background: #1a5928 !important; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .main-card { border: none; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
                    .table thead th { background: #f8f9fa; color: #495057; font-weight: 600; border-top: none; }
                    .img-thumbnail { border-radius: 8px; }
                </style>
            </head>
            <body>
                <nav class="navbar navbar-expand-lg navbar-dark mb-4">
                    <div class="container">
                        <a class="navbar-brand fw-bold" href="#"><i class="bi bi-mortarboard-fill me-2"></i> Dashboard PSB</a>
                        <div class="ms-auto">
                            <a href="/" class="btn btn-sm btn-outline-light me-2"><i class="bi bi-house"></i> Depan</a>
                            <a href="/logout" class="btn btn-sm btn-danger px-3"><i class="bi bi-box-arrow-right"></i> Keluar</a>
                        </div>
                    </div>
                </nav>

                <div class="container">
                    <div class="row mb-4">
                        <div class="col-md-8">
                            <h3 class="fw-bold text-dark mb-0">Daftar Calon Santri</h3>
                            <p class="text-muted">Kelola data pendaftaran santri baru secara real-time</p>
                        </div>
                        <div class="col-md-4 text-md-end">
                            <a href="/export-excel" class="btn btn-success shadow-sm rounded-pill px-4">
                                <i class="bi bi-file-earmark-excel me-1"></i> Export Excel
                            </a>
                        </div>
                    </div>

                    <div class="card main-card">
                        <div class="card-body p-4">
                            <div class="table-responsive">
                                <table id="tabelSantri" class="table table-hover align-middle">
                                    <thead>
                                        <tr>
                                            <th class="text-center" width="5%">No</th>
                                            <th class="text-center" width="10%">Foto</th>
                                            <th>Nama Lengkap</th>
                                            <th>Jenjang Tujuan</th>
                                            <th class="text-center" width="20%">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script src="https://cdn.datatables.net/1.13.4/js/jquery.dataTables.min.js"></script>
                <script src="https://cdn.datatables.net/1.13.4/js/dataTables.bootstrap5.min.js"></script>
                
                <script>
                    $(document).ready(function() {
                        $('#tabelSantri').DataTable({
                            language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
                            pageLength: 10,
                            responsive: true
                        });
                    });

                    function showDetail(id) {
                        alert('Fitur detail lengkap untuk ID: ' + id + ' sedang dikembangkan!');
                        // Nanti bisa diarahkan ke halaman detail khusus per santri
                    }
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
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