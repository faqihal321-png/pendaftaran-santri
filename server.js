const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// 1. Setup Folder Upload
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Konfigurasi Multer (Penyimpanan File)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 3. Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// 4. Inisialisasi Firebase
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
    } else {
        const serviceAccount = require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
    }
    db = admin.database();
    console.log("✅ Firebase Terhubung");
} catch (error) {
    console.log("❌ Firebase Error: " + error.message);
}

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PROSES SIMPAN DATA (MENANGANI FILE & TEKS)
app.post('/simpan', upload.fields([
    { name: 'foto_santri' },
    { name: 'foto_ktp_ayah' },
    { name: 'kartu_keluarga' },
    { name: 'foto_ijazah' }
]), async (req, res) => {
    try {
        // Ambil data teks dari body
        const d = req.body;
        
        // Simpan ke Firebase dengan field yang sesuai index.html
        const ref = db.ref("pendaftar").push();
        await ref.set({
            nisn: d.nisn || "-",
            nik: d.nik || "-",
            nama: d.nama || "Tanpa Nama",
            tempat_lahir: d.tempat_lahir || "-",
            tanggal_lahir: d.tanggal_lahir || "-",
            sekolah_tujuan: d.sekolah_tujuan || "-",
            whatsapp: d.whatsapp_orangtua || "-",
            waktu_daftar: new Date().toLocaleString("id-ID"),
            // Simpan nama file hasil upload
            berkas: {
                foto: req.files['foto_santri'] ? req.files['foto_santri'][0].filename : null,
                ktp: req.files['foto_ktp_ayah'] ? req.files['foto_ktp_ayah'][0].filename : null
            }
        });

        res.send("<script>alert('Berhasil Terdaftar!'); window.location.href='/';</script>");
    } catch (e) {
        res.status(500).send("Error Simpan: " + e.message);
    }
});

// --- ADMIN PANEL ---

app.get('/login', (req, res) => {
    res.send(`<div style="text-align:center;margin-top:100px;font-family:sans-serif;">
        <h2>Admin Login</h2>
        <form action="/login" method="POST">
            <input name="user" placeholder="Username" style="padding:10px;margin-bottom:10px;"><br>
            <input name="pass" type="password" placeholder="Password" style="padding:10px;margin-bottom:10px;"><br>
            <button type="submit" style="padding:10px 20px;background:green;color:white;border:none;border-radius:5px;">Masuk</button>
        </form>
    </div>`);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === "admin" && pass === "pesantren2026") {
        res.cookie('admin_auth', 'session_active', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Gagal!'); window.location.href='/login';</script>");
});

app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.admin_auth !== 'session_active') return res.redirect('/login');
    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        let rows = "";
        Object.keys(data).reverse().forEach(id => {
            const s = data[id];
            rows += `<tr>
                <td style="border:1px solid #ddd;padding:8px;">${s.nama}</td>
                <td style="border:1px solid #ddd;padding:8px;">${s.sekolah_tujuan}</td>
                <td style="border:1px solid #ddd;padding:8px;">${s.whatsapp}</td>
                <td style="border:1px solid #ddd;padding:8px;">
                    ${s.berkas && s.berkas.foto ? `<a href="/uploads/${s.berkas.foto}" target="_blank">Lihat Foto</a>` : '-'}
                </td>
            </tr>`;
        });
        res.send(`
            <div style="font-family:sans-serif;padding:20px;">
                <h1>Data Pendaftar Santri</h1>
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="background:#eee;"><th>Nama</th><th>Jenjang</th><th>WA Ortu</th><th>Berkas</th></tr>
                    ${rows}
                </table><br><a href="/logout">Logout</a>
            </div>
        `);
    } catch (e) { res.send("Error Database"); }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server Jalan!");
});