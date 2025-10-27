const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const toNum = v => (Number.isFinite(+v) ? +v : 0);

// ... (Fungsi computeARAS tidak berubah) ...
function computeARAS({ kriteria, alternatif }) {
    // ... (kode sama seperti sebelumnya) ...
    const sumW = kriteria.reduce((s, k) => s + toNum(k.bobot), 0);
    const W = sumW > 0 ? kriteria.map(k => toNum(k.bobot) / sumW) : kriteria.map(() => 0);
    const m = alternatif.length,
        k = kriteria.length;

    const xprime = Array.from({ length: m }, () => Array(k).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < k; j++) {
            if (!kriteria[j]) {
                console.error(`Error: kriteria[${j}] tidak ada. Alternatif:`, alternatif[i], 'Kriteria:', kriteria);
                continue;
            }
            const x = toNum(alternatif[i]?.nilai[j]);
            xprime[i][j] = (kriteria[j].tipe === 'cost') ? (x === 0 ? 0 : 1 / x) : x;
        }
    }

    const sumCol = Array(k).fill(0);
    for (let j = 0; j < k; j++)
        for (let i = 0; i < m; i++) sumCol[j] += xprime[i]?.[j] || 0;

    const rij = Array.from({ length: m }, () => Array(k).fill(0));
    for (let i = 0; i < m; i++)
        for (let j = 0; j < k; j++) rij[i][j] = sumCol[j] ? (xprime[i]?.[j] || 0) / sumCol[j] : 0;

    const skor = Array(m).fill(0);
    for (let i = 0; i < m; i++)
        for (let j = 0; j < k; j++) {
            if (kriteria[j]) {
                skor[i] += (W[j] || 0) * (rij[i]?.[j] || 0);
            }
        }

    const ranked = skor
        .map((s, i) => ({ idx: i, nama: (alternatif[i] ? alternatif[i].nama : 'Nama Error'), skor: s }))
        .sort((a, b) => (b.skor - a.skor) || (a.nama && b.nama ? a.nama.localeCompare(b.nama) : 0))
        .map((o, r) => ({ idx: o.idx, nama: o.nama, skor: o.skor, rank: r + 1 }));

    return { W, xprime, sumCol, rij, skor, ranked };
}

// ---------- VIEW ----------
router.get('/', (req, res) => {
    const user = (req.session && req.session.user) ? req.session.user : null;
    res.render('index', { title: 'SPK ARAS', user });
});

// ---------- API ----------
router.get('/api/kriteria', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id_kriteria AS id, kode, nama, tipe, bobot FROM kriteria ORDER BY id_kriteria'
        );
        res.json(rows);
    } catch (e) {
        console.error("Error fetching kriteria:", e);
        res.status(500).json([]);
    }
});

router.get('/api/alternatif', async (_req, res) => {
     try {
        const [rows] = await pool.query(
            'SELECT id_alternatif AS id, nama FROM alternatif ORDER BY id_alternatif'
        );
        res.json(rows);
     } catch (e) {
        console.error("Error fetching alternatif:", e);
        res.status(500).json([]);
     }
});

router.get('/api/nilai', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id_alternatif, id_kriteria, nilai FROM nilai ORDER BY id_alternatif,id_kriteria'
        );
        res.json(rows);
    } catch (e) {
        console.error("Error fetching nilai:", e);
        res.status(500).json([]);
    }
});

// ---------- API UNTUK MEMBACA HISTORY ----------
router.get('/api/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const id_user = (req.session && req.session.user && req.session.user.id_user)
            ? req.session.user.id_user
            : null;

        const [rows] = await pool.query(
            'SELECT judul AS title, payload FROM history WHERE id_history = ? AND (id_user = ? OR id_user IS NULL)', // Ambil 'judul', beri alias 'title'
            [id, id_user]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Riwayat tidak ditemukan atau bukan milik Anda' });
        }

        const history = rows[0]; // history.title sekarang berisi nilai dari kolom 'judul'

        let payloadJson;
        try {
            payloadJson = JSON.parse(history.payload);
        } catch (e) {
            console.error("Gagal parse payload JSON untuk history ID:", id, e);
            return res.status(500).json({ ok: false, error: 'Gagal parse data payload riwayat' });
        }

        // Kirim 'title' (yang asalnya dari 'judul') ke frontend
        res.json({
            ok: true,
            data: {
                title: history.title, // Frontend tetap menerima 'title'
                payload: payloadJson
            }
        });

    } catch (e) {
        console.error("Error di route /api/history/:id :", e);
        res.status(500).json({ ok: false, error: e.message || 'Terjadi kesalahan server' });
    }
});

/**
 * POST /api/compute
 */
router.post('/api/compute', express.json(), async (req, res) => {
    const save = !!(req.body && req.body.save);
    const judulStudiKasus = (req.body && req.body.title) || null; // Ambil judul dari request
    const mode = (req.body && req.body.history_mode) || 'light';
    const snap = (req.body && req.body.payload && req.body.payload.snapshot) || null;

    // =======================================================
    // PERUBAHAN: Tangkap ID riwayat jika ini adalah mode edit
    // =======================================================
    const history_id_to_update = (req.body && req.body.history_id_to_update)
        ? Number(req.body.history_id_to_update)
        : null;


    // ... (fungsi normNum dan normSnap tidak berubah) ...
    const normNum = v => (Number.isFinite(+v) ? +v : 0);
    const normSnap = (s) => {
        if (!s || !Array.isArray(s.kriteria) || !Array.isArray(s.alternatif)) return null;
        const kriteria = s.kriteria.map(k => ({
            kode: String(k.kode || ''),
            nama: String(k.nama || ''),
            tipe: (k.tipe === 'cost' ? 'cost' : 'benefit'),
            bobot: normNum(k.bobot)
        }));
        const alternatif = s.alternatif.map(a => ({
            nama: String(a.nama || ''),
            nilai: Array.isArray(a.nilai) ? a.nilai.map(normNum) : []
        }));
        alternatif.forEach(a => {
            if (a.nilai.length < kriteria.length) {
                a.nilai = [...a.nilai, ...Array(kriteria.length - a.nilai.length).fill(0)];
            }
        });
        return { kriteria, alternatif };
    };


    try {
        let dataset;
        let result;
        let historyId = null; // Akan diisi oleh ID baru (insert) atau ID lama (update)

        if (mode === 'full') {
            const normalized = normSnap(snap);
            if (!normalized || !normalized.kriteria || !normalized.alternatif) {
                 return res.status(400).json({ ok: false, error: 'Snapshot tidak valid atau data kriteria/alternatif hilang.' });
            }
            dataset = normalized;
            result = computeARAS(dataset);

            if (save) {
                const conn = await pool.getConnection();
                try {
                    await conn.beginTransaction();

                    // ... (DELETE dan INSERT kriteria, alternatif, nilai, hasil tidak berubah) ...
                    await conn.query('DELETE FROM nilai');
                    await conn.query('DELETE FROM hasil');
                    await conn.query('DELETE FROM alternatif');
                    await conn.query('DELETE FROM kriteria');

                    const kriIds = [];
                    for (const k of dataset.kriteria) {
                        const [r] = await conn.query(
                            'INSERT INTO kriteria (kode, nama, tipe, bobot) VALUES (?,?,?,?)',
                            [k.kode, k.nama, k.tipe, k.bobot]
                        );
                        kriIds.push(r.insertId);
                    }

                    const altIds = [];
                    for (const a of dataset.alternatif) {
                        const [ar] = await conn.query('INSERT INTO alternatif (nama) VALUES (?)', [a.nama]);
                        const idAlt = ar.insertId;
                        altIds.push(idAlt);
                        for (let j = 0; j < kriIds.length; j++) {
                            const v = normNum(a.nilai[j]);
                            await conn.query(
                                'INSERT INTO nilai (id_alternatif,id_kriteria,nilai) VALUES (?,?,?)',
                                [idAlt, kriIds[j], v]
                            );
                        }
                    }

                    for (const r of result.ranked) {
                        const idAltBaru = altIds[r.idx];
                        await conn.query(
                            'INSERT INTO hasil (id_alternatif, skor, `rank`) VALUES (?,?,?)',
                            [idAltBaru, r.skor, r.rank]
                        );
                    }


                    const best = result.ranked[0]
                        ? { nama: result.ranked[0].nama, skor: result.ranked[0].skor }
                        : { nama: null, skor: null };
                    const id_user = (req.session && req.session.user && req.session.user.id_user) || null;
                    const payloadString = dataset ? JSON.stringify({ snapshot: dataset, ranked: result.ranked }) : '{}';
                    const totalAlt = dataset ? dataset.alternatif.length : 0;

                    // =======================================================
                    // PERUBAHAN: Logika UPDATE atau INSERT (Mode Full)
                    // =======================================================
                    if (history_id_to_update) {
                        // --- INI ADALAH UPDATE ---
                        // (Asumsi: Anda tidak ingin kolom 'updated_at', jika ada, tambahkan sendiri)
                        await conn.query(
                            `UPDATE history SET 
                                judul = ?, 
                                best_alt = ?, 
                                best_score = ?, 
                                total_alt = ?, 
                                payload = ?
                             WHERE id_history = ? AND (id_user = ? OR id_user IS NULL)`,
                            [
                                judulStudiKasus,
                                best.nama,
                                best.skor,
                                totalAlt,
                                payloadString,
                                history_id_to_update, // ID riwayat yang di-update
                                id_user               // Pastikan user-nya sama
                            ]
                        );
                        historyId = history_id_to_update; // Kembalikan ID yang baru saja di-update
                    } else {
                        // --- INI ADALAH INSERT BARU (Logika asli Anda) ---
                        const [ins] = await conn.query(
                            `INSERT INTO history (id_user, judul, best_alt, best_score, total_alt, payload)
                             VALUES (?,?, ?,?,?,?)`,
                            [
                                id_user,
                                judulStudiKasus,
                                best.nama,
                                best.skor,
                                totalAlt,
                                payloadString
                            ]
                        );
                        historyId = ins.insertId; // Kembalikan ID baru
                    }

                    await conn.commit();
                } catch (e) {
                    await conn.rollback();
                    console.error("Error during DB transaction (full mode):", e);
                    throw e;
                } finally {
                    conn.release();
                }
            }
        } else { // mode === 'light'
            // ... (Kode SELECT dari DB tidak berubah) ...
             const [kCri] = await pool.query(
                'SELECT id_kriteria AS id, kode, nama, tipe, bobot FROM kriteria ORDER BY id_kriteria'
            );
            const [kAlt] = await pool.query(
                'SELECT id_alternatif AS id, nama FROM alternatif ORDER BY id_alternatif'
            );
            const [kNil] = await pool.query(
                'SELECT id_alternatif,id_kriteria,nilai FROM nilai ORDER BY id_alternatif,id_kriteria'
            );

            // ... (Kode persiapan data untuk computeARAS tidak berubah) ...
            const kriteria = kCri.map(r => ({ id: r.id, kode: r.kode, nama: r.nama, tipe: r.tipe, bobot: normNum(r.bobot) }));
            const alternatifForCompute = kAlt.map(a => ({
                id: a.id,
                nama: a.nama,
                nilai: Array(kriteria.length).fill(0)
            }));
             const altIndexMap = new Map(alternatifForCompute.map((a, i) => [a.id, i]));
             const kriIndexMap = new Map(kriteria.map((k, j) => [k.id, j]));
            for (const n of kNil) {
                 const altIndex = altIndexMap.get(n.id_alternatif);
                 const kriIndex = kriIndexMap.get(n.id_kriteria);
                 if (altIndex !== undefined && kriIndex !== undefined) {
                     alternatifForCompute[altIndex].nilai[kriIndex] = normNum(n.nilai);
                 }
            }
             const computeData = {
                 kriteria: kriteria.map(({ id, ...k }) => k),
                 alternatif: alternatifForCompute.map(({ id, ...a }) => a)
             };

             result = computeARAS(computeData); // Hitung

            if (save) {
                const conn = await pool.getConnection();
                try {
                    await conn.beginTransaction();

                     // ... (Kode DELETE dan INSERT hasil tidak berubah) ...
                    await conn.query('DELETE FROM hasil');
                    for (const r of result.ranked) {
                         const originalAlt = alternatifForCompute[r.idx];
                         if (!originalAlt) {
                             console.warn(`Peringatan: Alternatif dengan indeks ${r.idx} tidak ditemukan saat menyimpan hasil mode light.`);
                              continue;
                         }
                        await conn.query(
                            'INSERT INTO hasil (id_alternatif, skor, `rank`) VALUES (?,?,?)',
                            [originalAlt.id, r.skor, r.rank]
                        );
                    }

                    // ... (Kode persiapan snapshot, best, id_user tidak berubah) ...
                    const snapshot = {
                        kriteria: kriteria.map(k => ({ kode: k.kode, nama: k.nama, tipe: k.tipe, bobot: k.bobot })),
                        alternatif: alternatifForCompute.map(a => ({ nama: a.nama, nilai: a.nilai }))
                    };
                    const best = result.ranked[0]
                        ? { nama: result.ranked[0].nama, skor: result.ranked[0].skor }
                        : { nama: null, skor: null };
                    const id_user = (req.session && req.session.user && req.session.user.id_user) || null;
                    const payloadString = JSON.stringify({ snapshot, ranked: result.ranked });
                    const totalAlt = alternatifForCompute.length;
                    
                    // =======================================================
                    // PERUBAHAN: Logika UPDATE atau INSERT (Mode Light)
                    // =======================================================
                    if (history_id_to_update) {
                        // --- INI ADALAH UPDATE ---
                        await conn.query(
                            `UPDATE history SET 
                                judul = ?, 
                                best_alt = ?, 
                                best_score = ?, 
                                total_alt = ?, 
                                payload = ?
                             WHERE id_history = ? AND (id_user = ? OR id_user IS NULL)`,
                            [
                                judulStudiKasus,
                                best.nama,
                                best.skor,
                                totalAlt,
                                payloadString,
                                history_id_to_update, // ID riwayat yang di-update
                                id_user               // Pastikan user-nya sama
                            ]
                        );
                        historyId = history_id_to_update; // Kembalikan ID yang baru saja di-update
                    } else {
                        // --- INI ADALAH INSERT BARU (Logika asli Anda) ---
                        const [ins] = await conn.query(
                            `INSERT INTO history (id_user, judul, best_alt, best_score, total_alt, payload)
                             VALUES (?,?, ?,?,?,?)`,
                            [
                                id_user,
                                judulStudiKasus,
                                best.nama,
                                best.skor,
                                totalAlt,
                                payloadString
                            ]
                        );
                        historyId = ins.insertId; // Kembalikan ID baru
                    }

                    await conn.commit();
                } catch (e) {
                    await conn.rollback();
                     console.error("Error during DB transaction (light mode):", e);
                    throw e;
                } finally {
                    conn.release();
                }
            }
             dataset = { kriteria: computeData.kriteria, alternatif: computeData.alternatif };
        } // akhir dari else (mode light)

        if (!result) {
           console.error("Error: Variabel 'result' tidak terdefinisi sebelum mengirim response.");
           return res.status(500).json({ ok: false, error: 'Terjadi kesalahan internal: Hasil perhitungan tidak ada.'});
        }
        const finalW = result.W || [];

        res.json({
            ok: true,
            steps: { W: finalW, /* ... sisanya ... */ xprime: result.xprime, sumCol: result.sumCol, rij: result.rij, skor: result.skor },
            ranked: result.ranked,
            saved: save,
            history_id: historyId // Kirim ID yang relevan (baru atau lama) kembali ke frontend
        });
    } catch (e) {
        console.error("Error di route /api/compute :", e);
        res.status(500).json({ ok: false, error: e.message || 'Terjadi kesalahan server' });
    }
});

module.exports = router;