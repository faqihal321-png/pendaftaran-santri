const express = require('express');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- INISIALISASI FIREBASE ---
let db;
try {
    const config = process.env.FIREBASE_CONFIG;
    if (config) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(config)),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Terhubung ke Firebase (Mode Railway)");
    } else {
        const serviceAccount = require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://psb-pesantren-default-rtdb.asia-southeast1.firebasedatabase.app/"
        });
        console.log("✅ Terhubung ke Firebase (Mode Lokal)");
    }
    db = admin.database();
} catch (error) {
    console.log("❌ Error Koneksi: " + error.message);
}

// --- RUTE HALAMAN (ROUTES) ---

// 1. Redirect Halaman Utama ke Pendaftaran
app.get('/', (req, res) => {
    res.redirect('/daftar');
});

// 2. Halaman Formulir Pendaftaran (Untuk Santri)
app.get('/daftar', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; max-width:400px; margin:50px auto; padding:20px; border:1px solid #ccc; border-radius:10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
            <h2 style="text-align:center;">Formulir Pendaftaran Santri</h2>
            <form action="/simpan" method="POST">
                <label>Nama Lengkap:</label><br>
                <input name="nama" required style="width:100%; padding:10px; margin:10px 0; border:1px solid #ddd; border-radius:5px;"><br>
                
                <label>Email:</label><br>
                <input name="email" type="email" placeholder="contoh@gmail.com" style="width:100%; padding:10px; margin:10px 0; border:1px solid #ddd; border-radius:5px;"><br>
                
                <label>Nomor WhatsApp:</label><br>
                <input name="whatsapp" type="tel" placeholder="08123456789" style="width:100%; padding:10px; margin:10px 0; border:1px solid #ddd; border-radius:5px;"><br>
                
                <button type="submit" style="background:#007bff; color:white; padding:12px; border:none; border-radius:5px; width:100%; cursor:pointer; font-size:16px;">Kirim Pendaftaran</button>
            </form>
            <p style="text-align:center; margin-top:20px;"><a href="/login" style="color:#666; font-size:12px; text-decoration:none;">Login Admin</a></p>
        </div>
    `);
});

// 3. Proses Simpan Data (Dari Santri ke Firebase)
app.post('/simpan', async (req, res) => {
    try {
        const { nama, email, whatsapp } = req.body;
        if (!nama) return res.send("Nama wajib diisi!");

        const pendaftarBaru = db.ref("pendaftar").push();
        await pendaftarBaru.set({
            nama: nama,
            email: email || "-",
            whatsapp: whatsapp || "-",
            waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        });

        res.send(`
            <script>
                alert('Berhasil! Data pendaftaran ${nama} telah diterima.');
                window.location.href = '/daftar';
            </script>
        `);
        console.log("✅ Santri baru terdaftar: " + nama);
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

// 4. Halaman Login Admin
app.get('/login', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>Admin Login - PSB</h2>
            <form action="/login" method="POST" style="display:inline-block; border:1px solid #ccc; padding:30px; border-radius:15px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <input name="user" placeholder="Username" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <input name="pass" type="password" placeholder="Password" required style="display:block; width:200px; margin-bottom:10px; padding:10px;"><br>
                <button type="submit" style="width:220px; padding:10px; background: #28a745; color:white; border:none; border-radius:5px; cursor:pointer;">Masuk</button>
            </form>
            <br><br><a href="/daftar">Kembali ke Pendaftaran</a>
        </div>
    `);
});

// 5. Proses Login Admin
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === "admin" && pass === "pesantren2026") {
        res.cookie('admin_auth', 'session_active', {
            httpOnly: true,
            secure: true,      
            sameSite: 'none',  
            maxAge: 24 * 60 * 60 * 1000 
        });
        return res.redirect('/admin');
    }
    res.send("<script>alert('Login Gagal!'); window.location.href='/login';</script>");
});

// 6. Halaman Dashboard Data Santri (Admin Only)
app.get('/admin', async (req, res) => {
    if (!req.cookies || req.cookies.admin_auth !== 'session_active') {
        return res.redirect('/login');
    }

    try {
        const snapshot = await db.ref("pendaftar").once("value");
        const data = snapshot.val() || {};
        
        let barisTabel = "";
        Object.keys(data).reverse().forEach(id => {
            const santri = data[id];
            barisTabel += `
                <tr>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.nama || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.email || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px;">${santri.whatsapp || '-'}</td>
                    <td style="border:1px solid #ddd; padding:10px; font-size:12px;">${santri.waktu || '-'}</td>
                </tr>`;
        });

        res.send(`
            <div style="font-family:sans-serif; padding:40px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h1>Data Calon Santri</h1>
                    <a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">[ Keluar ]</a>
                </div>
                <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <thead>
                        <tr style="background:#007bff; color:white; text-align:left;">
                            <th style="border:1px solid #ddd; padding:12px;">Nama</th>
                            <th style="border:1px solid #ddd; padding:12px;">Email</th>
                            <th style="border:1px solid #ddd; padding:12px;">WhatsApp</th>
                            <th style="border:1px solid #ddd; padding:12px;">Waktu Daftar</th>
                        </tr>
                    </thead>
                    <tbody>${barisTabel}</tbody>
                </table>
            </div>
        `);
    } catch (e) {
        res.send("Error Database: " + e.message);
    }
});

// 7. Logout
app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/login');
});

// --- MENJALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Server Berjalan!");
    console.log("👉 Akses Pendaftaran: http://localhost:" + PORT + "/daftar");
});