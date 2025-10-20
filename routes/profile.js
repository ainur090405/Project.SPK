// routes/profile.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// GET /profile – tampil + daftar riwayat
router.get('/', async(req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/logres');

    try {
        const id = req.session.user.id_user;

        // Ambil data user
        const [
            [u]
        ] = await pool.query(
            'SELECT id_user, nama, email, created_at FROM users WHERE id_user=? LIMIT 1', [id]
        );
        // Fallback ke data session jika query gagal (meskipun seharusnya tidak)
        const user = u || req.session.user;

        // Ambil daftar riwayat
        // =======================================================
        // PERBAIKAN: SELECT 'judul' AS 'title'
        // =======================================================
        const [items] = await pool.query(
            `SELECT id_history, judul AS title, best_alt, best_score, total_alt, created_at
             FROM history
             WHERE id_user=?
             ORDER BY id_history DESC`, [id] // Baca 'judul', beri nama alias 'title'
        );

        // Kirim data user dan riwayat (items) ke template EJS
        res.render('auth/profile', {
            title: 'Profil Pengguna',
            user,      // Data user (id_user, nama, email, created_at)
            items,     // Daftar riwayat (array of objects, masing-masing punya .title, .best_alt, dll.)
            messages: req.flash()
        });
    } catch (e) {
        console.error("Error fetching profile data:", e); // Log error server
        req.flash('error', 'Gagal memuat data profil atau riwayat.'); // Kirim flash message
        // Render halaman dengan data user dari session saja, riwayat kosong
        res.render('auth/profile', {
            title: 'Profil Pengguna',
            user: req.session.user,
            items: [], // Kirim array kosong jika error
            messages: req.flash()
        });
    }
});


// POST /profile/password – ganti password (form-urlencoded)
router.post('/password', express.urlencoded({ extended: true }), async(req, res) => {
    try {
        if (!req.session || !req.session.user) {
            req.flash('error', 'Silakan login terlebih dahulu.');
            return res.redirect('/logres');
        }
        const id = req.session.user.id_user;
        const { current_password, new_password } = req.body || {};

        if (!current_password || !new_password) {
            req.flash('error', 'Lengkapi password lama & baru.');
            return res.redirect('/profile');
        }

        const [
            [row]
        ] = await pool.query('SELECT password FROM users WHERE id_user=?', [id]);
        if (!row) {
            req.flash('error', 'User tidak ditemukan.');
            return res.redirect('/profile'); // Redirect kembali ke profile
        }

        const ok = await bcrypt.compare(current_password, row.password);
        if (!ok) {
            req.flash('error', 'Password lama salah.');
            return res.redirect('/profile');
        }

        // Validasi panjang password baru (opsional tapi disarankan)
        if (new_password.length < 6) { // Contoh: minimal 6 karakter
             req.flash('error', 'Password baru minimal 6 karakter.');
             return res.redirect('/profile');
        }


        const hash = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password=? WHERE id_user=?', [hash, id]);

        req.flash('success', 'Password berhasil diubah.');
        // Redirect ke profile agar user melihat pesan suksesnya
        return res.redirect('/profile');
    } catch (e) {
        console.error("Error changing password:", e); // Log error server
        req.flash('error', e.message || 'Gagal mengganti password.');
        return res.redirect('/profile');
    }
});

/**
 * GET /api/history/:id – ambil snapshot lengkap untuk dimuat ke beranda
 * (Ini berbeda dari GET /api/history/:id di index.js, pathnya /profile/api/history/:id)
 * Sebaiknya disatukan atau diberi nama berbeda agar tidak bingung.
 * Kode ini tampaknya mengembalikan lebih banyak data (termasuk meta).
 */
router.get('/api/history/:id', async(req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const id = req.params.id;
        const id_user_session = req.session.user.id_user; // Ambil ID user dari session

        // ====================================================================
        // PERBAIKAN: Baca 'judul' AS 'title' dan validasi id_user
        // ====================================================================
        const [
            [row]
        ] = await pool.query(
            // Tambahkan cek id_user untuk keamanan
            `SELECT id_history, id_user, judul AS title, best_alt, best_score, total_alt, created_at, payload
             FROM history WHERE id_history=? AND (id_user = ? OR id_user IS NULL) LIMIT 1`,
            [id, id_user_session] // Validasi dengan id_user dari session
        );

        if (!row) return res.status(404).json({ ok: false, error: 'History tidak ditemukan atau bukan milik Anda' });

        let parsed = null;
        if (row.payload && typeof row.payload === 'string') {
            try {
                parsed = JSON.parse(row.payload);
            } catch (e) {
                 console.error("Gagal parse payload JSON untuk history ID (profile route):", id, e);
                return res.status(500).json({ ok: false, error: 'Payload corrupt' });
            }
        }

        // konsisten dengan yang diharapkan index.ejs: data.data.payload.snapshot harus ada
        // (Format response ini berbeda dengan /api/history/:id di index.js)
        if (!parsed || !parsed.snapshot) {
            // Sebaiknya tetap kirim OK true jika history ditemukan tapi snapshot kosong
            // return res.status(200).json({ ok: false, error: 'Snapshot tidak ditemukan dalam payload' });
             console.warn(`Snapshot tidak ditemukan di payload untuk history ID ${id}`);
        }

        // Mengembalikan format yang sedikit berbeda dari /api/history/:id di index.js
        // Pastikan frontend yang memanggil /profile/api/history/:id mengharapkan format ini
        return res.json({
            ok: true,
            // Jika EJS index mengharapkan { data: { payload: { snapshot, ranked } } }
            // maka sesuaikan di sini atau satukan kedua endpoint /api/history/:id
            data: parsed || {}, // Kirim objek kosong jika parse gagal/snapshot tidak ada
            meta: {
                id_history: row.id_history,
                title: row.title, // Menggunakan 'title' dari alias 'judul AS title'
                best_alt: row.best_alt,
                best_score: row.best_score,
                total_alt: row.total_alt,
                created_at: row.created_at
            }
        });
    } catch (e) {
         console.error("Error di route /profile/api/history/:id :", e);
        return res.status(500).json({ ok: false, error: e.message || 'Terjadi kesalahan server' });
    }
});


// Endpoint ini tampaknya tidak terpakai oleh GET /profile (yang sudah query sendiri)
// Mungkin untuk keperluan lain?
router.get('/api/history', async(req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const idUser = req.session.user.id_user;
        // =======================================================
        // PERBAIKAN: SELECT 'judul' AS 'title'
        // =======================================================
        const [rows] = await pool.query(
            `SELECT id_history, judul AS title, best_alt, best_score, total_alt, created_at
             FROM history WHERE id_user=? ORDER BY id_history DESC`, [idUser] // Baca 'judul', alias 'title'
        );
        return res.json({ ok: true, items: rows });
    } catch (e) {
         console.error("Error di route /profile/api/history :", e);
        return res.status(500).json({ ok: false, error: e.message || 'Terjadi kesalahan server' });
    }
});

module.exports = router;