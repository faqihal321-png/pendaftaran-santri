const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");
const path = require('path');
const multer = require('multer'); // Library untuk handle upload file
const fs = require('fs');

const app = express();

// Konfigurasi Folder Upload (Jika belum ada, otomatis dibuat)
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Pengaturan penyimpanan file multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// --- INISIALISASI FIREBASE ---
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
} catch (error) {
    console.log("❌ Error Firebase: " + error.message);
}

// --- RUTE PENDAFTARAN ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PROSES SIMPAN DATA (Sangat Detail Sesuai index.html Anda)
app.post('/simpan', upload.fields([
    { name: 'foto_santri' },
    { name: 'foto_ktp_ayah' },
    { name: 'kartu_keluarga' },
    { name: 'foto_ijazah' }
]), async (req, res) => {
    try {
        // Mengambil semua data teks dari formulir
        const { 
            nisn, nik, nama, tempat_lahir, tanggal_lahir, 
            alamat, hp_santri, sekolah_tujuan, 
            nama_ayah, pekerjaan_ayah, nama_ibu, pekerjaan_ibu, 
            whatsapp_orangtua 
        } = req.body;

        // Mengambil nama file yang berhasil diupload
        const files = req.files;

        const pendaftarBaru = db.ref("pendaftar").push();
        await pendaftarBaru.set({
            nisn, nik, nama, tempat_lahir, tanggal_lahir,
            alamat, hp_santri, sekolah_tujuan,
            nama_ayah, pekerjaan_ayah, nama_ibu, pekerjaan_ibu,
            whatsapp: whatsapp_orangtua, // Kita simpan sebagai 'whatsapp' agar mudah dibaca di admin
            berkas: {
                foto: files['foto_santri'] ? files['foto_santri'][0].filename : null,
                ktp_ayah: files['foto_ktp_ayah'] ? files['foto_ktp_ayah'][0].filename : null,
                kk: files['kartu_keluarga'] ? files['kartu_keluarga'][0].filename : null,
                ijazah: files['foto_ijazah'] ? files['foto_ijazah'][0].filename : null
            },
            waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        });

        res.send("<script>alert('Pendaftaran Berhasil! Data Anda telah tersimpan.'); window.location.href='/';</script>");
    } catch (e) {
        console.error(e);
        res.status(500).send("Gagal simpan data: " + e.message);
    }
});

// --- RUTE ADMIN ---

app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>Admin Login</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:30px; border-radius:15px;">
                <input name="user" placeholder="Username" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <button type="submit" style="width:220px; padding:10px; background: #28a745; color:white; border:none; border-radius:5px;">Masuk</button>
            </form>
        </div>
    `);
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
        let baris = "";
        
        Object.keys(data).reverse().forEach(id => {
            const s = data[id];
            baris += `
                <tr>
                    <td style="border:1px solid #ddd; padding:10px;">${s.nama || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${s.sekolah_tujuan || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${s.whatsapp || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">
                        ${s.berkas && s.berkas.foto ? `<a href="/uploads/${s.berkas.foto}" target="_blank">Lihat Foto</a>` : 'No File'}
                    </td>
                </tr>`;
        });

        res.send(`
            <div style="font-family:sans-serif; padding:20px;">
                <h1>Data Pendaftar Santri</h1>
                <table style="width:100%; border-collapse:collapse;">
                    <tr style="background:#f4f4f4;">
                        <th style="border:1px solid #ddd; padding:10px;">Nama Santri</th>
                        <th style="border:1px solid #ddd; padding:10px;">Jenjang</th>
                        <th style="border:1px solid #ddd; padding:10px;">WhatsApp Ortu</th>
                        <th style="border:1px solid #ddd; padding:10px;">Berkas</th>
                    </tr>
                    ${baris}
                </table>
                <br>
                <a href="/logout" style="color:red;">Logout</a>
            </div>
        `);
    } catch (e) { res.send("Error Database: " + e.message); }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server Jalan di Port " + PORT);
});