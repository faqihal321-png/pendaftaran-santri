const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('rahasia-psb-2026'));

// Folder upload
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

// --- FIREBASE ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
    db = admin.database();
    console.log("✅ Firebase Ready");
} catch (e) {
    console.error("❌ Firebase Error:", e.message);
}

// --- MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

// --- AUTH ADMIN ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "pesantren2026";

// --- ROUTES ---

// Form Pendaftaran
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Simpan Data
app.post('/simpan', upload.fields([
    { name: 'foto_santri' }, { name: 'foto_ktp_ayah' }, 
    { name: 'foto_ijazah' }, { name: 'kartu_keluarga' }
]), async (req, res) => {
    try {
        let data = { ...req.body, waktu: new Date().toLocaleString('id-ID') };
        if (req.files) {
            Object.keys(req.files).forEach(k => data[k] = req.files[k][0].filename);
        }
        await db.ref("pendaftar").push(data);
        res.send("<h2>✅ Data Tersimpan!</h2><a href='/'>Kembali</a>");
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

// Login Page
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0f2f5;">
            <form action="/login" method="POST" style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                <h3>Admin Login</h3>
                <input type="text" name="user" placeholder="Username" required style="display:block;width:100%;margin-bottom:10px;padding:8px;"><br>
                <input type="password" name="pass" placeholder="Password" required style="display:block;width:100%;margin-bottom:10px;padding:8px;"><br>
                <button type="submit" style="width:100%;padding:10px;background:#1a5928;color:white;border:none;border-radius:5px;cursor:pointer;">Masuk</button>
            </form>
        </body>
    `);
});

// Proses Login
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        // Gunakan cookie sederhana dulu untuk testing
        res.cookie('auth_status', 'logged_in', { maxAge: 86400000 });
        res.redirect('/admin');
    } else {
        res.send("<script>alert('Salah!'); window.location.href='/login';</script>");
    }
});

// Admin Panel (Tampilan Dasar)
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.auth_status !== 'logged_in') return res.redirect('/login');

    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));

        let rows = list.map((s, i) => `
            <tr>
                <td>${i+1}</td>
                <td><img src="/uploads/${s.foto_santri}" width="50" onerror="this.src='https://via.placeholder.com/50'"></td>
                <td>${s.nama}</td>
                <td><a href="/uploads/${s.foto_ktp_ayah}" target="_blank">Lihat KTP</a></td>
            </tr>
        `).join('');

        res.send(`
            <h2>Daftar Santri</h2>
            <a href="/logout">Logout</a><hr>
            <table border="1" style="width:100%; border-collapse:collapse; text-align:left;">
                <thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Berkas</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `);
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_status');
    res.redirect('/login');
});

// Railway Listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log("✅ Server jalan di port " + PORT));