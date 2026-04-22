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
    console.error("❌ Firebase Error:", e.message);
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

// --- 5. ROUTE ADMIN (DASHBOARD) ---
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
                <title>Admin Panel - PSB</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
                <style>
                    body { background: #f8fafc; font-family: 'Segoe UI', sans-serif; }
                    .navbar { background: #1a5928; }
                    .section-title { border-bottom: 2px solid #f1f5f9; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold; color: #1a5928; }
                    .detail-label { font-weight: bold; color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
                    .detail-value { color: #1e293b; font-weight: 600; margin-bottom: 10px; }
                </style>
            </head>
            <body>
                <nav class="navbar navbar-dark mb-4 shadow-sm">
                    <div class="container"><span class="navbar-brand fw-bold">Dashboard Admin PSB</span><a href="/logout" class="btn btn-sm btn-danger">Keluar</a></div>
                </nav>
                <div class="container">
                    <div class="card border-0 shadow-sm rounded-4 p-4">
                        <table class="table table-hover align-middle">
                            <thead class="table-light"><tr><th class="text-center">No</th><th class="text-center">Foto</th><th>Nama</th><th>Jenjang</th><th class="text-center">Aksi</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
                <div class="modal fade" id="modalDetail" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content"><div class="modal-body p-4" id="detailContent"></div></div></div></div>
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    function viewDetail(s) {
                        const content = \`
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <img src="/uploads/\${s.foto_santri}" class="img-fluid rounded border shadow-sm mb-2" onerror="this.src='https://via.placeholder.com/200x250'">
                                    <div class="badge bg-success w-100">\${s.sekolah_tujuan || '-'}</div>
                                </div>
                                <div class="col-md-8">
                                    <h6 class="section-title">DATA PRIBADI</h6>
                                    <div class="row">
                                        <div class="col-6"><div class="detail-label">Nama</div><div class="detail-value">\${s.nama}</div></div>
                                        <div class="col-6"><div class="detail-label">NISN</div><div class="detail-value">\${s.nisn || s.nim || '-'}</div></div>
                                        <div class="col-12"><div class="detail-label">Alamat</div><div class="detail-value bg-light p-2 rounded small">\${s.alamat || '-'}</div></div>
                                    </div>
                                    <h6 class="section-title mt-3">BERKAS</h6>
                                    <div class="d-flex gap-2">
                                        \${s.foto_ktp_ayah ? \`<a href="/uploads/\${s.foto_ktp_ayah}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1">KTP</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">KTP Kosong</button>'}
                                        \${s.foto_ijazah ? \`<a href="/uploads/\${s.foto_ijazah}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1">Ijazah</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">Ijazah Kosong</button>'}
                                        \${s.kartu_keluarga ? \`<a href="/uploads/\${s.kartu_keluarga}" target="_blank" class="btn btn-sm btn-outline-dark flex-grow-1">KK</a>\` : '<button class="btn btn-sm btn-light disabled flex-grow-1">KK Kosong</button>'}
                                    </div>
                                </div>
                            </div>\`;
                        document.getElementById('detailContent').innerHTML = content;
                        new bootstrap.Modal(document.getElementById('modalDetail')).show();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (e) { res.status(500).send("Gagal: " + e.message); }
});

// --- 6. ROUTE PENDAFTARAN (FIXED) ---
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

// Hanya gunakan SATU rute simpan yaitu /simpan sesuai di form action index.html
app.post('/simpan', cpUpload, async (req, res) => {
    try {
        const data = { ...req.body, waktu: new Date().toLocaleString() };

        // WAJIB: Simpan nama file ke database agar tidak 'undefined'
        if (req.files) {
            if (req.files['foto_santri']) data.foto_santri = req.files['foto_santri'][0].filename;
            if (req.files['foto_ktp_ayah']) data.foto_ktp_ayah = req.files['foto_ktp_ayah'][0].filename;
            if (req.files['foto_ijazah']) data.foto_ijazah = req.files['foto_ijazah'][0].filename;
            if (req.files['kartu_keluarga']) data.kartu_keluarga = req.files['kartu_keluarga'][0].filename;
        }

        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Pendaftaran Berhasil!</h2><p>Data Anda telah kami terima.</p><a href='/'>Kembali</a>");
    } catch (e) {
        console.error(e);
        res.status(500).send("Gagal Simpan: " + e.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`✅ Server Aktif di Port ${PORT}`); });