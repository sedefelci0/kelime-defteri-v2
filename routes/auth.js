const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const CLASS_LIST = require('../db/classes-config');

const router = express.Router();

// Öğretmen/öğrenci ayrımı için kolon (sunucu açılırken bir kez, varsa dokunmaz)
pool
  .query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_teacher BOOLEAN NOT NULL DEFAULT FALSE')
  .then(() => console.log('[db] is_teacher kolonu hazır.'))
  .catch((e) => console.error('[db] is_teacher kolonu eklenemedi:', e.message));

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName, role, className, teacherPassword } = req.body || {};

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'E-posta, şifre ve ad alanları zorunludur.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Geçerli bir e-posta adresi girmelisin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı.' });
    }

    let isTeacher = false;
    let finalClassName = null;

    if (role === 'teacher') {
      // ÖĞRETMEN: şifre SUNUCUDA kontrol edilir. Öğrenci tahmin edip geçemez.
      if (!process.env.OWNER_PASSWORD) {
        return res.status(500).json({ error: 'Sunucu yapılandırması eksik (OWNER_PASSWORD yok).' });
      }
      if (!teacherPassword || teacherPassword !== process.env.OWNER_PASSWORD) {
        return res.status(401).json({ error: 'Öğretmen şifresi yanlış.' });
      }
      isTeacher = true;
      finalClassName = null;
    } else {
      // ÖĞRENCI: sınıf seçimi zorunlu.
      if (!className || !CLASS_LIST.includes(className)) {
        return res.status(400).json({ error: 'Geçerli bir sınıf seçmelisin.' });
      }
      finalClassName = className;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta ile zaten bir hesap var.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, class_name, is_teacher)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, class_name, is_teacher`,
      [email.toLowerCase(), passwordHash, displayName.trim(), finalClassName, isTeacher]
    );

    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.ownerUnlocked = user.is_teacher === true; // admin paneli bunu kullanıyor

    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      className: user.class_name,
      isTeacher: user.is_teacher,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, is_teacher FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'E-posta veya şifre yanlış.' });
    }

    req.session.userId = user.id;
    req.session.ownerUnlocked = user.is_teacher === true; // öğretmense panel açık
    res.json({ id: user.id, email: user.email, displayName: user.display_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Giriş yapılmamış.' });
  }
  const result = await pool.query(
    'SELECT id, email, display_name, class_name, total_study_seconds, is_teacher FROM users WHERE id = $1',
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Giriş yapılmamış.' });
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    className: user.class_name,
    totalStudySeconds: user.total_study_seconds,
    isOwner: user.is_teacher === true,
  });
});

module.exports = router;
