const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- 1. KONFIGURASI DASAR ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-pesantren-2026'));

// Pastikan folder uploads tersedia
if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// --- 2. FIREBASE ---
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
    console.error("❌ Firebase Error: Periksa FIREBASE_CONFIG!", e.message);
}

// --- 3. KEAMANAN ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

function checkAuth(req, res, next) {
    if (req.cookies && req.cookies.auth_status === 'logged_in') {
        return next();
    }
    res.redirect('/login');
}

// --- 4. ROUTES LOGIN ---
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
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true, path: '/' });
        res.redirect('/admin');
    } else {
        res.send("<script>alert('Username/Password Salah!'); window.location.href='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status', { path: '/' });
    res.redirect('/login');
});

// --- 5. ADMIN PANEL ---
app.get('/admin', checkAuth, async (req, res) => {
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const daftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = daftar.map((s, i) => `
            <tr class="align-middle">
                <td class="text-center text-muted fw-bold">${i + 1}</td>
                <td class="text-center">
                    <div class="avatar-wrapper">
                        <img src="/uploads/${s.foto_santri}" class="rounded-3 shadow-sm" onerror="this.src='https://via.placeholder.com/100x125?text=No+Photo'">
                    </div>
                </td>
                <td>
                    <div class="fw-bold text-dark mb-0">${s.nama}</div>
                    <small class="text-muted"><i class="bi bi-fingerprint"></i> ${s.nisn || s.nim || '-'}</small>
                </td>
                <td>
                    <span class="badge rounded-pill ${s.sekolah_tujuan === 'MADRASAH ALIYYAH' ? 'bg-primary' : 'bg-success'} bg-opacity-10 text-${s.sekolah_tujuan === 'MADRASAH ALIYYAH' ? 'primary' : 'success'} px-3">
                        ${s.sekolah_tujuan || '-'}
                    </span>
                </td>
                <td>
                    <div class="d-flex flex-column small text-muted">
                        <span><i class="bi bi-geo-alt-fill me-1"></i>${s.tempat_lahir || '-'}</span>
                        <span><i class="bi bi-calendar-event me-1"></i>${s.tanggal_lahir || '-'}</span>
                    </div>
                </td>
                <td class="text-center">
                    <button class="btn btn-light btn-sm border shadow-sm px-3 fw-bold text-primary" onclick='viewDetail(${JSON.stringify(s)})'>
                        <i class="bi bi-search me-1"></i> Detail
                    </button>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Panel PSB - Pesantren Ihyauth Tholibin</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
                <style>
                    :root { --primary-color: #1a5928; --secondary-color: #2d6a4f; }
                    body { background-color: #f0f2f5; font-family: 'Inter', sans-serif; color: #334155; }
                    .navbar { background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .card-main { border: none; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); background: white; }
                    .table thead { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; }
                    .table thead th { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; padding: 15px; }
                    .avatar-wrapper img { width: 45px; height: 55px; object-fit: cover; transition: 0.3s; }
                    .avatar-wrapper img:hover { transform: scale(1.1); }
                    .btn-detail { border-radius: 10px; transition: 0.3s; }
                    .modal-content { border: none; border-radius: 25px; overflow: hidden; }
                    .section-header { border-left: 4px solid var(--primary-color); padding-left: 10px; margin: 20px 0 15px; font-weight: 800; color: var(--primary-color); font-size: 0.9rem; letter-spacing: 0.5px; }
                    .info-box { background: #f8fafc; padding: 12px; border-radius: 12px; height: 100%; border: 1px solid #edf2f7; }
                    .info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
                    .info-value { font-size: 14px; color: #1e293b; font-weight: 600; }
                </style>
            </head>
            <body>
                <nav class="navbar navbar-dark sticky-top mb-4">
                    <div class="container">
                        <span class="navbar-brand fw-bold d-flex align-items-center">
                            <i class="bi bi-grid-1x2-fill me-2"></i> DASHBOARD ADMIN PSB
                        </span>
                        <div class="d-flex align-items-center">
                            <span class="text-white-50 me-3 d-none d-md-block small">Ihyauth Tholibin Management</span>
                            <a href="/logout" class="btn btn-sm btn-outline-light rounded-pill px-3">Keluar</a>
                        </div>
                    </div>
                </nav>

                <div class="container mb-5">
                    <div class="card card-main p-4">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <h4 class="fw-800 m-0 text-dark">Data Calon Santri</h4>
                            <span class="badge bg-dark px-3 py-2">${daftar.length} Total Terdaftar</span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th class="text-center">No</th>
                                        <th class="text-center">Foto</th>
                                        <th>Nama Lengkap</th>
                                        <th>Jenjang</th>
                                        <th>TTL</th>
                                        <th class="text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="modalDetail" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content shadow-lg">
                            <div class="modal-header border-0 bg-light p-4">
                                <h5 class="modal-title fw-bold"><i class="bi bi-person-badge me-2 text-primary"></i>Profil Lengkap Santri</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-4" id="detailContent"></div>
                        </div>
                    </div>
                </div>

                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    function viewDetail(s) {
                        const content = \`
                            <div class="row g-4">
                                <div class="col-md-4 text-center">
                                    <div class="p-2 border rounded-4 bg-white shadow-sm mb-3">
                                        <img src="/uploads/\${s.foto_santri}" class="img-fluid rounded-3 w-100" style="max-height: 350px; object-fit: cover;" onerror="this.src='https://via.placeholder.com/300x400'">
                                    </div>
                                    <div class="badge bg-primary fs-6 w-100 py-2 rounded-3 shadow-sm">\${s.sekolah_tujuan || '-'}</div>
                                    <div class="mt-3 text-muted small italic">Terdaftar pada: \${s.waktu || '-'}</div>
                                </div>

                                <div class="col-md-8">
                                    <h6 class="section-header">INFORMASI PRIBADI</h6>
                                    <div class="row g-3">
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">Nama Lengkap</div><div class="info-value text-uppercase">\${s.nama}</div></div></div>
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">NISN</div><div class="info-value">\${s.nisn || s.nim || '-'}</div></div></div>
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">NIK</div><div class="info-value">\${s.nik || '-'}</div></div></div>
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">Tempat, Tgl Lahir</div><div class="info-value">\${s.tempat_lahir}, \${s.tanggal_lahir}</div></div></div>
                                        <div class="col-12"><div class="info-box"><div class="info-label">Alamat Lengkap</div><div class="info-value small">\${s.alamat || '-'}</div></div></div>
                                    </div>

                                    <h6 class="section-header">DATA ORANG TUA / WALI</h6>
                                    <div class="row g-3">
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">Nama Ayah (Pekerjaan)</div><div class="info-value">\${s.nama_ayah} (\${s.pekerjaan_ayah})</div></div></div>
                                        <div class="col-sm-6"><div class="info-box"><div class="info-label">Nama Ibu (Pekerjaan)</div><div class="info-value">\${s.nama_ibu} (\${s.pekerjaan_ibu})</div></div></div>
                                        <div class="col-12">
                                            <a href="https://wa.me/\${s.whatsapp_orangtua}" target="_blank" class="btn btn-success w-100 py-2 rounded-3 fw-bold border-0">
                                                <i class="bi bi-whatsapp me-2"></i>Hubungi Orang Tua (\${s.whatsapp_orangtua})
                                            </a>
                                        </div>
                                    </div>

                                    <h6 class="section-header">BERKAS DIGITAL</h6>
                                    <div class="row g-2">
                                        <div class="col-4">
                                            \${s.foto_ktp_ayah ? \`<a href="/uploads/\${s.foto_ktp_ayah}" target="_blank" class="btn btn-outline-dark btn-sm w-100 py-2"><i class="bi bi-card-image me-1"></i> KTP Ayah</a>\` : '<button class="btn btn-light btn-sm w-100 disabled text-muted">KTP Ayah</button>'}
                                        </div>
                                        <div class="col-4">
                                            \${s.foto_ijazah ? \`<a href="/uploads/\${s.foto_ijazah}" target="_blank" class="btn btn-outline-dark btn-sm w-100 py-2"><i class="bi bi-file-earmark-pdf me-1"></i> Ijazah</a>\` : '<button class="btn btn-light btn-sm w-100 disabled text-muted">Ijazah</button>'}
                                        </div>
                                        <div class="col-4">
                                            \${s.kartu_keluarga ? \`<a href="/uploads/\${s.kartu_keluarga}" target="_blank" class="btn btn-outline-dark btn-sm w-100 py-2"><i class="bi bi-people me-1"></i> KK</a>\` : '<button class="btn btn-light btn-sm w-100 disabled text-muted">KK</button>'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        \`;
                        document.getElementById('detailContent').innerHTML = content;
                        new bootstrap.Modal(document.getElementById('modalDetail')).show();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (e) { res.status(500).send("Gagal Memuat Data: " + e.message); }
});

// --- 6. ROUTE PENDAFTARAN (SOLUSI UPLOAD) ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

const cpUpload = upload.fields([
    { name: 'foto_santri', maxCount: 1 },
    { name: 'foto_ktp_ayah', maxCount: 1 },
    { name: 'foto_ijazah', maxCount: 1 },
    { name: 'kartu_keluarga', maxCount: 1 }
]);

app.post('/simpan', cpUpload, async (req, res) => {
    try {
        // Gabungkan data form teks dan waktu pendaftaran
        const data = { ...req.body, waktu: new Date().toLocaleString() };

        // WAJIB: Ambil nama file asli dari Multer dan simpan ke database Firebase
        if (req.files) {
            if (req.files['foto_santri']) data.foto_santri = req.files['foto_santri'][0].filename;
            if (req.files['foto_ktp_ayah']) data.foto_ktp_ayah = req.files['foto_ktp_ayah'][0].filename;
            if (req.files['foto_ijazah']) data.foto_ijazah = req.files['foto_ijazah'][0].filename;
            if (req.files['kartu_keluarga']) data.kartu_keluarga = req.files['kartu_keluarga'][0].filename;
        }

        // Simpan objek data lengkap ke Firebase
        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Pendaftaran Berhasil!</h2><a href='/'>Kembali</a>");
    } catch (e) {
        console.error("Gagal Simpan:", e.message);
        res.status(500).send("Gagal: " + e.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`✅ Server Aktif di Port ${PORT}`); });