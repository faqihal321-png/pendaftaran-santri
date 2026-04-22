const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const session = require('express-session');
const axios = require('axios');
const admin = require("firebase-admin");

const app = express();

// --- 1. SETTINGS & MIDDLEWARE ---
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder Uploads
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// Konfigurasi Session
app.use(session({
    secret: 'rahasia-pesantren-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Set true jika menggunakan HTTPS
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// --- 2. KONFIGURASI FIREBASE ---
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
});
const db = admin.database();

// --- 3. AUTHENTICATION HELPER ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

function checkAuth(req, res, next) {
    if (req.session.isAdmin) return next();
    res.redirect('/login');
}

// --- 4. MULTER STORAGE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- 5. ROUTES: LOGIN & LOGOUT ---
app.get('/login', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Login Admin</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: sans-serif; background: #f4f7f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .login-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 300px; text-align: center; }
                input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
                button { width: 100%; padding: 10px; background: #2d5a27; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h3>Login Admin</h3>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="Username Admin" required>
                    <input type="password" name="password" placeholder="Password Admin" required>
                    <button type="submit">Masuk</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAdmin = true;
        return req.session.save(() => res.redirect('/admin'));
    }
    res.send('Username atau Password Salah!');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- 6. ROUTES: PENDAFTARAN ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const cpUpload = upload.fields([
    { name: 'foto_ktp_ayah', maxCount: 1 },
    { name: 'foto_ijazah', maxCount: 1 },
    { name: 'foto_santri', maxCount: 1 },
    { name: 'kartu_keluarga', maxCount: 1 }
]);

app.post('/simpan', cpUpload, async (req, res) => {
    try {
        if (!req.files || !req.files['foto_santri']) return res.status(400).send('File belum lengkap!');

        const dataBaru = {
            ...req.body,
            foto_santri: req.files['foto_santri'][0].filename,
            foto_ktp_ayah: req.files['foto_ktp_ayah'] ? req.files['foto_ktp_ayah'][0].filename : '',
            foto_ijazah: req.files['foto_ijazah'] ? req.files['foto_ijazah'][0].filename : '',
            kartu_keluarga: req.files['kartu_keluarga'] ? req.files['kartu_keluarga'][0].filename : '',
            waktu_daftar: new Date().toLocaleString('id-ID')
        };
        
        await db.ref("pendaftar").push(dataBaru);
        kirimWhatsApp(req.body.whatsapp_orangtua, req.body.nama);

        res.send(`
            <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#e9ecef;">
                <div style="background:white; display:inline-block; padding:40px; border-radius:20px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
                    <h2 style="color:#28a745;">✅ Pendaftaran Berhasil!</h2>
                    <p>Terima kasih <b>${req.body.nama}</b>, data Anda telah aman tersimpan.</p>
                    <a href="/" style="background:#28a745; color:white; padding:10px 20px; text-decoration:none; border-radius:30px; font-weight:bold;">Kembali</a>
                </div>
            </body>
        `);
    } catch (error) {
        res.status(500).send("Gagal simpan ke Firebase.");
    }
});

// --- 7. ROUTE: ADMIN PANEL ---
app.get('/admin', checkAuth, async (req, res) => {
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const daftar = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        const tableRows = daftar.map((s, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><img src="/uploads/${s.foto_santri}" style="width:45px; height:55px; object-fit:cover; border-radius:4px;"></td>
                <td style="text-align:left;"><b>${s.nama}</b><br><small>NIK: ${s.nik || '-'}</small></td>
                <td>${s.sekolah_tujuan || '-'}</td>
                <td><a href="https://wa.me/${s.whatsapp_orangtua}" target="_blank" style="color:#25d366; text-decoration:none;"><b>📱 ${s.whatsapp_orangtua}</b></a></td>
                <td>
                    <a href="/uploads/${s.foto_ktp_ayah}" target="_blank">KTP</a> | 
                    <a href="/uploads/${s.foto_ijazah}" target="_blank">Ijazah</a>
                </td>
            </tr>
        `).join('');

        res.send(`
            <html>
            <head><title>Admin Panel</title><style>
                body { font-family: sans-serif; background: #f0f2f5; padding: 20px; margin:0; }
                .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 1000px; margin: auto; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: center; }
                th { background: #1a5928; color: white; }
                .btn-group { margin-bottom: 20px; display: flex; gap: 10px; }
                .btn { padding: 10px 15px; text-decoration: none; border-radius: 8px; color: white; font-weight: bold; font-size: 14px; }
            </style></head>
            <body>
                <div class="card">
                    <h2>Daftar Calon Santri (Firebase Cloud)</h2>
                    <div class="btn-group">
                        <a href="/export-excel" class="btn" style="background:#217346;">📊 Export Excel</a>
                        <a href="/hapus-semua-data" class="btn" style="background:#d35400;" onclick="return confirm('Hapus semua data?')">🗑️ Reset</a>
                        <a href="/logout" class="btn" style="background:#c0392b;">Keluar</a>
                    </div>
                    <div style="overflow-x:auto;">
                        <table>
                            <thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>WhatsApp</th><th>Berkas</th></tr></thead>
                            <tbody>${tableRows || '<tr><td colspan="6">Belum ada data di cloud.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Gagal mengambil data dari Firebase.");
    }
});

// --- 8. EXPORT & UTILITIES ---
app.get('/export-excel', checkAuth, async (req, res) => {
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const dataMap = snapshot.val() || {};
        const daftar = Object.values(dataMap);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Data Santri');

        worksheet.columns = [
            { header: 'No', key: 'no', width: 5 },
            { header: 'Nama Lengkap', key: 'nama', width: 25 },
            { header: 'WhatsApp', key: 'whatsapp_orangtua', width: 20 },
            { header: 'Waktu Daftar', key: 'waktu_daftar', width: 20 }
        ];

        daftar.forEach((s, index) => {
            worksheet.addRow({ no: index + 1, nama: s.nama, whatsapp_orangtua: s.whatsapp_orangtua, waktu_daftar: s.waktu_daftar });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Data_Santri_Cloud.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { res.status(500).send("Gagal ekspor."); }
});

app.get('/hapus-semua-data', checkAuth, async (req, res) => {
    await db.ref("pendaftar").remove();
    res.send("<script>alert('Data di Cloud dikosongkan!'); window.location.href='/admin';</script>");
});

async function kirimWhatsApp(nomor, nama) {
    const token = 'TrsrNwaJuLUXInTKTB6mwA'; 
    if(!nomor) return;
    try {
        await axios.post('https://api.fonnte.com/send', {
            target: nomor,
            message: `Assalamu'alaikum *${nama}*,\n\nTerima kasih telah mendaftar di *Pondok Pesantren Ihyauth Tholibin*.\nData Anda telah aman tersimpan di cloud database kami.`,
            countryCode: '62'
        }, { headers: { 'Authorization': token.trim() } });
    } catch (error) { console.error('Gagal kirim WA:', error.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server Cloud berjalan di port ${PORT}`);
});