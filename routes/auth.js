const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const CLASS_LIST = require('../db/classes-config');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName, className } = req.body || {};

    if (!email || !password || !displayName || !className) {
      return res.status(400).json({ error: 'E-posta, şifre, ad ve sınıf alanları zorunludur.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Geçerli bir e-posta adresi girmelisin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı.' });
    }
    if (!CLASS_LIST.includes(className)) {
      return res.status(400).json({ error: 'Geçerli bir sınıf seçmelisin.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta ile zaten bir hesap var.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, class_name) VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, class_name`,
      [email.toLowerCase(), passwordHash, displayName.trim(), className]
    );

    const user = result.rows[0];
    req.session.userId = user.id;

    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      className: user.class_name,
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
      'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'E-posta veya şifre yanlış.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'E-posta veya şifre yanlış.' });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, displayName: user.display_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Giriş yapılmamış.' });
  }
  const result = await pool.query(
    'SELECT id, email, display_name, class_name, total_study_seconds FROM users WHERE id = $1',
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
    isOwner: req.session.ownerUnlocked === true,
  });
});

module.exports = router;
