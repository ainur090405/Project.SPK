// routes/logres.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // mysql2/promise pool
const bcrypt = require('bcryptjs');

// helper simpan ke session
const toSession = (u) => ({ id_user: u.id_user, nama: u.nama, email: u.email });

// GET /logres  -> halaman gabungan (login/register), default tab login
router.get(['/', '/login'], (req, res) => {
    res.render('auth/logres', { title: 'Login / Register', tab: 'login' });
});

router.get('/register', (req, res) => {
    res.render('auth/logres', { title: 'Login / Register', tab: 'register' });
});

// POST /logres/login
router.post('/login', async(req, res) => {
    try {
        const email = (req.body.email || '').trim();
        const password = req.body.password || '';

        if (!email || !password) {
            req.flash('error', 'Email dan password wajib diisi.');
            return res.redirect('/logres/login');
        }

        const [rows] = await pool.query('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
        const user = rows[0];
        if (!user) {
            req.flash('error', 'Email tidak terdaftar.');
            return res.redirect('/logres/login');
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            req.flash('error', 'Password salah.');
            return res.redirect('/logres/login');
        }
        req.session.user = toSession(user);
        req.flash('success', `Selamat datang, ${user.nama}!`);
        return res.redirect('/');
    } catch (e) {
        console.error('Login error:', e);
        req.flash('error', 'Kesalahan login.');
        return res.redirect('/logres/login');
    }
});

// POST /logres/register
router.post('/register', async(req, res) => {
    try {
        const nama = (req.body.nama || '').trim();
        const email = (req.body.email || '').trim();
        const password = req.body.password || '';

        if (!nama || !email || !password) {
            req.flash('error', 'Nama, email, dan password wajib diisi.');
            return res.redirect('/logres/register');
        }

        const [dupe] = await pool.query('SELECT 1 FROM users WHERE email=? LIMIT 1', [email]);
        if (dupe.length) {
            req.flash('error', 'Email sudah digunakan.');
            return res.redirect('/logres/register');
        }

        const hash = await bcrypt.hash(password, 10);
        const [ins] = await pool.query(
            'INSERT INTO users (nama, email, password) VALUES (?,?,?)', [nama, email, hash]
        );
        if (!ins.insertId) {
            req.flash('error', 'Registrasi gagal.');
            return res.redirect('/logres/register');
        }

        req.flash('success', 'Registrasi berhasil. Silakan login.');
        return res.redirect('/logres/login');
    } catch (e) {
        console.error('Register error:', e);
        req.flash('error', 'Kesalahan registrasi.');
        return res.redirect('/logres/register');
    }
});

// GET /logres/logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/logres'));
});

module.exports = router;