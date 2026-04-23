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
app.use(express.static(__dirname));

// --- 2. FIREBASE & STORAGE ---
let db;
let bucket;

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/",
        storageBucket: "psb-pesantren-default-rtdb.appspot.com" 
    });
    
    db = admin.database();
    bucket = admin.storage().bucket();
    console.log("✅ Firebase & Storage Connected");
} catch (e) {
    console.error("❌ Firebase Error:", e.message);
}

// --- 3. KEAMANAN ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

function checkAuth(req, res, next) {
    if (req.cookies && req.cookies.auth_status === 'logged_in') return next();
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
                        <img src="${s.foto_santri}" class="rounded-3 shadow-sm" style="width:45px; height:55px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/100x125?text=No+Photo'">
                    </div>
                </td>
                <td>
                    <div class="fw-bold text-dark mb-0">${s.nama}</div>
                    <small class="text-muted"><i class="bi bi-fingerprint"></i> ${s.nisn || s.nim || '-'}</small>
                </td>
                <td>
                    <span class="badge rounded-pill bg-success bg-opacity-10 text-success px-3">
                        ${s.sekolah_tujuan || '-'}
                    </span>
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
                <title>Admin PSB - Pesantren Ihyauth Tholibin</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
                <style>
                    :root { --primary-color: #1a5928; }
                    body { background-color: #f0f2f5; font-family: 'Inter', sans-serif; }
                    .navbar { background: var(--primary-color) !important; }
                    .section-header { border-left: 4px solid var(--primary-color); padding-left: 10px; margin: 20px 0 10px; font-weight: bold; color: var(--primary-color); }
                    .info-box { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #edf2f7; margin-bottom: 10px; }
                    .info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
                    .info-value { font-weight: 600; color: #1e293b; }
                </style>
            </head>
            <body>
                <nav class="navbar navbar-dark mb-4"><div class="container"><span class="navbar-brand fw-bold">DASHBOARD ADMIN PSB</span><a href="/logout" class="btn btn-sm btn-outline-light">Keluar</a></div></nav>
                <div class="container"><div class="card p-4 shadow-sm border-0" style="border-radius:15px;">
                    <table class="table table-hover"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th class="text-center">Aksi</th></tr></thead><tbody>${rows}</tbody></table>
                </div></div>

                <div class="modal fade" id="modalDetail" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content" style="border-radius:20px;">
                    <div class="modal-header border-0"><h5 class="fw-bold">Profil Santri</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body p-4" id="detailContent"></div>
                </div></div></div>

                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    function viewDetail(s) {
                        const content = \`
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <img src="\${s.foto_santri}" class="img-fluid rounded shadow-sm mb-3" onerror="this.src='https://via.placeholder.com/300x400'">
                                    <div class="badge bg-primary w-100 py-2 mb-2">\${s.sekolah_tujuan || '-'}</div>
                                    <a href="https://wa.me/\${s.whatsapp_orangtua}" target="_blank" class="btn btn-success btn-sm w-100"><i class="bi bi-whatsapp"></i> Chat Ortu</a>
                                </div>
                                <div class="col-md-8">
                                    <h6 class="section-header">DATA PRIBADI</h6>
                                    <div class="row">
                                        <div class="col-6"><div class="info-box"><div class="info-label">Nama</div><div class="info-value">\${s.nama}</div></div></div>
                                        <div class="col-6"><div class="info-box"><div class="info-label">NISN</div><div class="info-value">\${s.nisn || '-'}</div></div></div>
                                        <div class="col-12"><div class="info-box"><div class="info-label">Alamat</div><div class="info-value">\${s.alamat || '-'}</div></div></div>
                                    </div>
                                    <h6 class="section-header">BERKAS DIGITAL</h6>
                                    <div class="d-grid gap-2">
                                        \${s.foto_ktp_ayah ? \`<a href="\${s.foto_ktp_ayah}" target="_blank" class="btn btn-outline-dark btn-sm text-start"><i class="bi bi-file-earmark-image"></i> Lihat KTP Ayah</a>\` : '<button class="btn btn-light btn-sm disabled">KTP Tidak Ada</button>'}
                                        \${s.foto_ijazah ? \`<a href="\${s.foto_ijazah}" target="_blank" class="btn btn-outline-dark btn-sm text-start"><i class="bi bi-file-earmark-text"></i> Lihat Ijazah</a>\` : '<button class="btn btn-light btn-sm disabled">Ijazah Tidak Ada</button>'}
                                        \${s.kartu_keluarga ? \`<a href="\${s.kartu_keluarga}" target="_blank" class="btn btn-outline-dark btn-sm text-start"><i class="bi bi-people"></i> Lihat Kartu Keluarga</a>\` : '<button class="btn btn-light btn-sm disabled">KK Tidak Ada</button>'}
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

// --- 6. ROUTE PENDAFTARAN ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

const cpUpload = upload.fields([
    { name: 'foto_santri', maxCount: 1 },
    { name: 'foto_ktp_ayah', maxCount: 1 },
    { name: 'foto_ijazah', maxCount: 1 },
    { name: 'kartu_keluarga', maxCount: 1 }
]);

app.post('/simpan', cpUpload, async (req, res) => {
    try {
        const data = { ...req.body, waktu: new Date().toLocaleString() };

        if (req.files) {
            const uploadPromises = Object.keys(req.files).map(fieldname => {
                return new Promise((resolve, reject) => {
                    const file = req.files[fieldname][0];
                    const fileName = Date.now() + "-" + file.originalname;
                    const blob = bucket.file(fileName);
                    const blobStream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });

                    blobStream.on('error', (err) => reject(err));
                    blobStream.on('finish', async () => {
                        await blob.makePublic();
                        data[fieldname] = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                        resolve();
                    });
                    blobStream.end(file.buffer);
                });
            });
            await Promise.all(uploadPromises);
        }

        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Pendaftaran Berhasil!</h2><a href='/'>Kembali</a>");
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`✅ Server Aktif di Port ${PORT}`); });