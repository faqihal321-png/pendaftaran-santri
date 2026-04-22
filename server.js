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
                    <img src="/uploads/${s.foto_santri}" class="img-thumbnail shadow-sm" style="width:50px; height:60px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/50x60'">
                </td>
                <td>
                    <div class="fw-bold text-dark">${s.nama}</div>
                    <small class="text-muted">NIK: ${s.nik || '-'}</small>
                </td>
                <td><span class="badge bg-success bg-opacity-10 text-success">${s.sekolah_tujuan || '-'}</span></td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <a href="https://wa.me/${s.whatsapp_orangtua}" target="_blank" class="btn btn-outline-success"><i class="bi bi-whatsapp"></i></a>
                        <button class="btn btn-primary" onclick='viewDetail(${JSON.stringify(s)})'>
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
                    body { background: #f8fafc; font-family: 'Segoe UI', sans-serif; }
                    .navbar { background: #1a5928; }
                    .detail-label { font-weight: bold; color: #64748b; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 2px; }
                    .detail-value { color: #1e293b; font-weight: 600; margin-bottom: 12px; font-size: 0.95rem; }
                    .modal-content { border-radius: 15px; border: none; }
                    .section-title { border-bottom: 2px solid #f1f5f9; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold; color: #1a5928; }
                </style>
            </head>
            <body>
                <nav class="navbar navbar-dark mb-4 shadow-sm">
                    <div class="container">
                        <span class="navbar-brand fw-bold"><i class="bi bi-mortarboard-fill me-2"></i> Dashboard Admin PSB</span>
                        <a href="/logout" class="btn btn-sm btn-danger px-3">Keluar</a>
                    </div>
                </nav>

                <div class="container">
                    <div class="card border-0 shadow-sm rounded-4 p-4">
                        <h4 class="fw-bold mb-4 text-dark text-center">Daftar Calon Santri Terdaftar</h4>
                        <div class="table-responsive">
                            <table id="tabelSantri" class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th class="text-center">No</th><th class="text-center">Foto</th><th>Nama</th><th>Jenjang</th><th class="text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="modalDetail" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content shadow-lg">
                            <div class="modal-header bg-light border-0">
                                <h5 class="fw-bold mb-0">Detail Lengkap Santri</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body p-4" id="detailContent"></div>
                        </div>
                    </div>
                </div>

                <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script src="https://cdn.datatables.net/1.13.4/js/jquery.dataTables.min.js"></script>
                <script src="https://cdn.datatables.net/1.13.4/js/dataTables.bootstrap5.min.js"></script>

                <script>
                    $(document).ready(function() {
                        $('#tabelSantri').DataTable({ language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' } });
                    });

                    function viewDetail(s) {
                        console.log("Data Santri:", s); // Cek isi data di Console Browser (F12)

                        // 1. Logika Pencarian Data Teks (Cek semua kemungkinan nama field)
                        const nisn_val = s.nisn || s.NISN || s.nisn_santri || '<span class="text-danger small italic">Belum Diisi</span>';
                        const alamat_val = s.alamat || s.alamat_lengkap || s.Alamat || '-';
                        const n_ayah = s.nama_ayah || s.namaAyah || '-';
                        const n_ibu = s.nama_ibu || s.namaIbu || '-';

                        // 2. Logika Pencarian Berkas (SANGAT PENTING)
                        // Mencari file di key utama, atau key cadangan yang mungkin dibuat Multer
                        const link_ktp = s.foto_ktp_ayah || s.ktp_ayah || s.ktp || s.foto_ktp;
                        const link_ijazah = s.foto_ijazah || s.ijazah || s.ijazah_santri || s.file_ijazah;
                        const link_kk = s.kartu_keluarga || s.kk || s.kk_santri || s.foto_kk;

                        const content = \`
                            <div class="row">
                                <div class="col-md-4 text-center mb-4">
                                    <img src="/uploads/\${s.foto_santri}" class="img-fluid rounded-4 shadow-sm border mb-3" style="max-height: 280px; width:100%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/200x280?text=No+Photo'">
                                    <div class="badge bg-success w-100 py-2 fs-6">\${s.sekolah_tujuan || '-'}</div>
                                </div>
                                <div class="col-md-8">
                                    <h6 class="section-title"><i class="bi bi-person-fill me-2"></i>DATA PRIBADI</h6>
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="detail-label">Nama Lengkap</div><div class="detail-value text-uppercase">\${s.nama || '-'}</div>
                                            <div class="detail-label">NISN</div><div class="detail-value">\${nisn_val}</div>
                                            <div class="detail-label">NIK</div><div class="detail-value">\${s.nik || '-'}</div>
                                        </div>
                                        <div class="col-6">
                                            <div class="detail-label">Tempat, Tgl Lahir</div><div class="detail-value">\${s.tempat_lahir || '-'}, \${s.tanggal_lahir || '-'}</div>
                                            <div class="detail-label">Jenis Kelamin</div><div class="detail-value">\${s.jenis_kelamin || '-'}</div>
                                            <div class="detail-label">Asal Sekolah</div><div class="detail-value">\${s.asal_sekolah || '-'}</div>
                                        </div>
                                        <div class="col-12">
                                            <div class="detail-label">Alamat Lengkap</div><div class="detail-value bg-light p-2 rounded border small mb-3">\${alamat_val}</div>
                                        </div>
                                    </div>

                                    <h6 class="section-title mt-2"><i class="bi bi-people-fill me-2"></i>DATA ORANG TUA / WALI</h6>
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="detail-label">Nama Ayah</div><div class="detail-value">\${n_ayah}</div>
                                            <div class="detail-label">Pekerjaan Ayah</div><div class="detail-value">\${s.pekerjaan_ayah || '-'}</div>
                                        </div>
                                        <div class="col-6">
                                            <div class="detail-label">Nama Ibu</div><div class="detail-value">\${n_ibu}</div>
                                            <div class="detail-label">WhatsApp</div><div class="detail-value fw-bold text-success">\${s.whatsapp_orangtua || '-'}</div>
                                        </div>
                                    </div>

                                    <h6 class="section-title mt-2"><i class="bi bi-file-earmark-check-fill me-2"></i>BERKAS PENDAFTARAN</h6>
                                    <div class="d-flex flex-wrap gap-2">
                                        \${link_ktp ? \`<a href="/uploads/\${link_ktp}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1"><i class="bi bi-image"></i> KTP</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">KTP Kosong</button>'}
                                        \${link_ijazah ? \`<a href="/uploads/\${link_ijazah}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1"><i class="bi bi-file-earmark-pdf"></i> Ijazah</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">Ijazah Kosong</button>'}
                                        \${link_kk ? \`<a href="/uploads/\${link_kk}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1"><i class="bi bi-people"></i> KK</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">KK Kosong</button>'}
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
    } catch (e) {
        res.status(500).send("Gagal Memuat Data: " + e.message);
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