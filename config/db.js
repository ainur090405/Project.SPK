const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'aras_simple',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Koneksi ke database berhasil!');
        connection.release();
    } catch (err) {
        console.error('❌ Gagal terkoneksi ke database:', err.message);
    }
})();

module.exports = pool;
