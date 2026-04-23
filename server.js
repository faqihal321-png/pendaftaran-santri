const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- 1. KONFIGURASI DASAR & FOLDER UPLOAD ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-pesantren-2026'));

// Otomatis membuat folder 'uploads' jika belum ada
if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
// Akses folder uploads agar foto bisa dilihat di browser
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// --- 2. FIREBASE REALTIME DATABASE SAJA ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Pastikan URL database ini sesuai dengan milik Anda
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
    db = admin.database();
    console.log("✅ Firebase Database Connected (Tanpa Storage)");
} catch (e) {
    console.error("❌ Firebase Error:", e.message);
}

// --- 3. KEAMANAN ADMIN ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

function checkAuth(req, res, next) {
    if (req.cookies && req.cookies.auth_status === 'logged_in') return next();
    res.redirect('/login');
}

// --- 4. ROUTE LOGIN ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; background:#eee; font-family:sans-serif;">
            <form action="/login" method="POST" style="background:white; padding:30px; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.1); width:300px;">
                <h2 style="text-align:center;">Login Admin</h2>
                <input type="text" name="user" placeholder="Username" required style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px;">
                <input type="password" name="pass" placeholder="Password" required style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px;">
                <button type="submit" style="width:100%; padding:10px; background:#1a5928; color:white; border:none; border-radius:5px; cursor:pointer;">MASUK</button>
            </form>
        </body>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.user === ADMIN_USER && req.body.pass === ADMIN_PASS) {
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000, httpOnly: true, path: '/' });
        res.redirect('/admin');
    } else {
        res.send("<script>alert('Password Salah!'); window.location.href='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status', { path: '/' });
    res.redirect('/login');
});

// --- 5. SETUP MULTER UNTUK SIMPAN FILE KE LOKAL ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Simpan ke folder uploads
    },
    filename: function (req, file, cb) {
        // Nama file = Waktu saat ini + nama asli file (agar tidak bentrok)
        const safeName = file.originalname.replace(/\s+/g, '-');
        cb(null, Date.now() + '-' + safeName);
    }
});

const upload = multer({ storage: storage });
const uploadFields = upload.fields([
    { name: 'foto_santri', maxCount: 1 },
    { name: 'foto_ktp_ayah', maxCount: 1 },
    { name: 'foto_ijazah', maxCount: 1 },
    { name: 'kartu_keluarga', maxCount: 1 }
]);

// --- 6. ROUTE PENDAFTARAN ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.post('/simpan', uploadFields, async (req, res) => {
    try {
        let data = { ...req.body, waktu: new Date().toLocaleString() };

        // Masukkan nama file yang diupload ke dalam data
        if (req.files) {
            if (req.files['foto_santri']) data.foto_santri = req.files['foto_santri'][0].filename;
            if (req.files['foto_ktp_ayah']) data.foto_ktp_ayah = req.files['foto_ktp_ayah'][0].filename;
            if (req.files['foto_ijazah']) data.foto_ijazah = req.files['foto_ijazah'][0].filename;
            if (req.files['kartu_keluarga']) data.kartu_keluarga = req.files['kartu_keluarga'][0].filename;
        }

        // Simpan teks dan nama file ke Firebase Database
        if (db) {
            await db.ref("pendaftar").push(data);
        }
        
        res.send(`
            <div style="text-align:center; padding:50px; font-family:sans-serif;">
                <h2 style="color:green;">✅ Pendaftaran Berhasil!</h2>
                <p>Data dan berkas Anda telah tersimpan.</p>
                <a href="/" style="padding:10px 20px; background:#1a5928; color:white; text-decoration:none; border-radius:5px;">Kembali ke Form</a>
            </div>
        `);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

// --- 7. ADMIN PANEL DASHBOARD ---
app.get('/admin', checkAuth, async (req, res) => {
    try {
        let daftar = [];
        if (db) {
            const snapshot = await db.ref("pendaftar").once("value");
            const data = snapshot.val() || {};
            daftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        }

        let rows = daftar.map((s, i) => `
            <tr class="align-middle">
                <td class="text-center">${i + 1}</td>
                <td class="text-center">
                    <img src="/uploads/${s.foto_santri}" class="rounded shadow-sm" style="width:50px; height:60px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/50x60?text=No+Photo'">
                </td>
                <td>
                    <strong>${s.nama}</strong><br>
                    <small class="text-muted">${s.nisn || s.nim || '-'}</small>
                </td>
                <td><span class="badge bg-success">${s.sekolah_tujuan || '-'}</span></td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm" onclick='viewDetail(${JSON.stringify(s)})'>Detail</button>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <title>Admin PSB</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style> body { background: #f4f6f9; } .navbar { background: #1a5928; } </style>
            </head>
            <body>
                <nav class="navbar navbar-dark mb-4"><div class="container"><span class="navbar-brand">Dashboard Admin</span><a href="/logout" class="btn btn-sm btn-light">Logout</a></div></nav>
                <div class="container">
                    <div class="card p-4 shadow-sm border-0 rounded-4">
                        <table class="table table-hover">
                            <thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Aksi</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="modal fade" id="modalDetail"><div class="modal-dialog modal-lg"><div class="modal-content">
                    <div class="modal-header"><h5 class="modal-title">Detail Santri</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body" id="detailContent"></div>
                </div></div></div>

                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    function viewDetail(s) {
                        const content = \`
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <img src="/uploads/\${s.foto_santri}" class="img-fluid rounded mb-3" onerror="this.src='https://via.placeholder.com/200x250?text=No+Photo'">
                                    <a href="https://wa.me/\${s.whatsapp_orangtua}" target="_blank" class="btn btn-success w-100">Chat WhatsApp</a>
                                </div>
                                <div class="col-md-8">
                                    <table class="table table-bordered">
                                        <tr><th>Nama</th><td>\${s.nama}</td></tr>
                                        <tr><th>NISN/NIK</th><td>\${s.nisn || '-'} / \${s.nik || '-'}</td></tr>
                                        <tr><th>TTL</th><td>\${s.tempat_lahir}, \${s.tanggal_lahir}</td></tr>
                                        <tr><th>Alamat</th><td>\${s.alamat}</td></tr>
                                        <tr><th>Nama Ayah</th><td>\${s.nama_ayah} (\${s.pekerjaan_ayah})</td></tr>
                                    </table>
                                    <h6>Berkas Digital:</h6>
                                    <div class="d-flex gap-2">
                                        \${s.foto_ktp_ayah ? \`<a href="/uploads/\${s.foto_ktp_ayah}" target="_blank" class="btn btn-sm btn-outline-dark">KTP Ayah</a>\` : ''}
                                        \${s.foto_ijazah ? \`<a href="/uploads/\${s.foto_ijazah}" target="_blank" class="btn btn-sm btn-outline-dark">Ijazah</a>\` : ''}
                                        \${s.kartu_keluarga ? \`<a href="/uploads/\${s.kartu_keluarga}" target="_blank" class="btn btn-sm btn-outline-dark">Kartu Keluarga</a>\` : ''}
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
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log("✅ Server Aktif di Port " + PORT); 
});