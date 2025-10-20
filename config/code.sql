-- === Setup database (opsional) ===
CREATE DATABASE IF NOT EXISTS aras_simple
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aras_simple;

-- Pastikan pakai InnoDB
SET default_storage_engine=INNODB;

-- ================================
-- 1) users
-- ================================
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id_user    INT AUTO_INCREMENT PRIMARY KEY,
  nama       VARCHAR(100)         NOT NULL,
  email      VARCHAR(120)         NOT NULL,
  password   VARCHAR(255)         NOT NULL,
  created_at DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- 2) kriteria
-- ================================
DROP TABLE IF EXISTS kriteria;
CREATE TABLE kriteria (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  kode      VARCHAR(10)           NOT NULL,
  nama      VARCHAR(100)          NOT NULL,
  tipe      ENUM('benefit','cost') NOT NULL DEFAULT 'benefit',
  bobot     DECIMAL(10,4)         NOT NULL DEFAULT 0,
  created_at DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kriteria_kode (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- 3) alternatif
-- ================================
DROP TABLE IF EXISTS alternatif;
CREATE TABLE alternatif (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nama      VARCHAR(100)          NOT NULL,
  created_at DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_alternatif_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- 4) nilai  (matrix penilaian A_i terhadap C_j)
-- ================================
DROP TABLE IF EXISTS nilai;
CREATE TABLE nilai (
  id_alternatif INT             NOT NULL,
  id_kriteria   INT             NOT NULL,
  nilai         DECIMAL(18,6)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id_alternatif, id_kriteria),
  KEY idx_nilai_kriteria (id_kriteria),
  CONSTRAINT fk_nilai_alt
    FOREIGN KEY (id_alternatif) REFERENCES alternatif(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_nilai_kri
    FOREIGN KEY (id_kriteria)   REFERENCES kriteria(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- 5) hasil  (skor & peringkat terakhir yang disimpan)
-- Catatan: sengaja TIDAK menyimpan id hasil; 1 baris per alternatif.
-- ================================
DROP TABLE IF EXISTS hasil;
CREATE TABLE hasil (
  id_alternatif INT             NOT NULL,
  skor          DECIMAL(18,9)   NOT NULL,
  rank        INT             NOT NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_alternatif),
  CONSTRAINT fk_hasil_alt
    FOREIGN KEY (id_alternatif) REFERENCES alternatif(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- 6) history  (riwayat run + snapshot)
-- payload disimpan LONGTEXT (kompatibel MariaDB). 
-- Jika MySQL ≥5.7, boleh ganti ke JSON.
-- ================================
DROP TABLE IF EXISTS history;
CREATE TABLE history (
  id_history  INT AUTO_INCREMENT PRIMARY KEY,
  id_user     INT              NULL,
  title       VARCHAR(255)     NULL,
  best_alt    VARCHAR(255)     NULL,
  best_score  DECIMAL(24,12)   NULL,
  total_alt   INT              NOT NULL,
  payload     LONGTEXT         NULL,   -- berisi {"snapshot":{...},"ranked":[...]}
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hist_user (id_user),
  CONSTRAINT fk_hist_user
    FOREIGN KEY (id_user) REFERENCES users(id_user)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (Opsional) Jika pakai MariaDB ≥10.4, bisa aktifkan validasi JSON:
-- ALTER TABLE history ADD CONSTRAINT chk_hist_payload_json CHECK (JSON_VALID(payload));

/* ==========================================
   SEED DATA CONTOH (opsional, untuk uji cepat)
   ========================================== */
-- User dummy (password isi sendiri)
-- INSERT INTO users (nama,email,password) VALUES ('Admin','admin@example.com','$2y$10$hashDiSini');

-- Kriteria contoh
-- INSERT INTO kriteria (kode,nama,tipe,bobot) VALUES
-- ('C1','Harga','cost',0.3),('C2','Kualitas','benefit',0.4),
-- ('C3','Ketepatan','benefit',0.2),('C4','Layanan','benefit',0.1);

-- Alternatif contoh
-- INSERT INTO alternatif (nama) VALUES ('Supplier A'),('Supplier B'),('Supplier C'),('Supplier D');

-- Nilai contoh
-- -- A1
-- INSERT INTO nilai VALUES (1,1,50000),(1,2,85),(1,3,90),(1,4,80);
-- -- A2
-- INSERT INTO nilai VALUES (2,1,45000),(2,2,80),(2,3,85),(2,4,85);
-- -- A3
-- INSERT INTO nilai VALUES (3,1,52000),(3,2,90),(3,3,88),(3,4,85);
-- -- A4
-- INSERT INTO nilai VALUES (4,1,48000),(4,2,88),(4,3,92),(4,4,82);