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
            <tr>
                <td>${i + 1}</td>
                <td><img src="/uploads/${s.foto_santri}" style="width:40px; height:50px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/40x50'"></td>
                <td><b>${s.nama}</b><br><small>NISN: ${s.nisn || s.nim || '-'}</small></td>
                <td>${s.sekolah_tujuan || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick='viewDetail(${JSON.stringify(s)})'>Detail</button>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin PSB</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            </head>
            <body class="bg-light">
                <nav class="navbar navbar-dark bg-dark mb-4"><div class="container"><span class="navbar-brand">Admin Panel</span><a href="/logout" class="btn btn-danger btn-sm">Keluar</a></div></nav>
                <div class="container"><div class="card p-4 shadow-sm"><h3>Data Santri</h3><table class="table table-hover"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div></div>
                <div class="modal fade" id="modalDetail" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-body" id="detailContent"></div></div></div></div>
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    function viewDetail(s) {
                        const content = \`
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <img src="/uploads/\${s.foto_santri}" class="img-fluid border mb-2" onerror="this.src='https://via.placeholder.com/200x250'">
                                    <div class="badge bg-success w-100">\${s.sekolah_tujuan || '-'}</div>
                                </div>
                                <div class="col-md-8">
                                    <h5>Data Pribadi</h5>
                                    <p><b>Nama:</b> \${s.nama}<br><b>NISN:</b> \${s.nisn || s.nim || '-'}<br><b>Alamat:</b> \${s.alamat || '-'}</p>
                                    <hr>
                                    <h5>Berkas Pendaftaran</h5>
                                    <div class="d-grid gap-2">
                                        \${s.foto_ktp_ayah ? \`<a href="/uploads/\${s.foto_ktp_ayah}" target="_blank" class="btn btn-outline-dark">Lihat KTP Ayah</a>\` : '<button class="btn btn-light disabled">KTP Ayah Kosong</button>'}
                                        \${s.foto_ijazah ? \`<a href="/uploads/\${s.foto_ijazah}" target="_blank" class="btn btn-outline-dark">Lihat Ijazah</a>\` : '<button class="btn btn-light disabled">Ijazah Kosong</button>'}
                                        \${s.kartu_keluarga ? \`<a href="/uploads/\${s.kartu_keluarga}" target="_blank" class="btn btn-outline-dark">Lihat KK</a>\` : '<button class="btn btn-light disabled">KK Kosong</button>'}
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
    } catch (e) { res.status(500).send("Error: " + e.message); }
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