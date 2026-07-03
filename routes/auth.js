const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db/pool');
const { STUDENT_CLASSES } = require('../db/classes-config');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

const router = express.Router();

// Schema migrations (idempotent)
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_teacher BOOLEAN NOT NULL DEFAULT FALSE')
  .then(() => console.log('[db] is_teacher hazir.'))
  .catch((e) => console.error('[db] is_teacher hatasi:', e.message));

pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE')
  .then(() => console.log('[db] email_verified hazir.'))
  .catch((e) => console.error('[db] email_verified hatasi:', e.message));

pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT')
  .catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ')
  .catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT')
  .catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ')
  .catch(() => {});

pool.query(`UPDATE words SET english = 'Abolition' WHERE lower(english) = 'ablolition'`)
  .catch(() => {});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function smtpEnabled() {
  return !!(process.env.SMTP_USER);
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName, role, className, teacherPassword } = req.body || {};

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'E-posta, sifre ve ad alanlari zorunludur.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Gecerli bir e-posta adresi girmelisin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Sifre en az 8 karakter olmali.' });
    }

    let isTeacher = false;
    let finalClassName = null;

    if (role === 'teacher') {
      if (!process.env.OWNER_PASSWORD) {
        return res.status(500).json({ error: 'Sunucu yapilandirmasi eksik (OWNER_PASSWORD yok).' });
      }
      if (!teacherPassword || teacherPassword !== process.env.OWNER_PASSWORD) {
        return res.status(401).json({ error: 'Ogretmen sifresi yanlis.' });
      }
      isTeacher = true;
    } else {
      if (!className || !STUDENT_CLASSES.includes(className)) {
        return res.status(400).json({ error: 'Gecerli bir sinif secmelisin.' });
      }
      finalClassName = className;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta ile zaten bir hesap var.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const useEmailVerification = smtpEnabled() && !isTeacher;
    const emailVerified = !useEmailVerification;

    let verifyToken = null;
    let verifyExpires = null;
    if (useEmailVerification) {
      verifyToken = crypto.randomBytes(32).toString('hex');
      verifyExpires = new Date(Date.now() + 60 * 60 * 1000);
    }

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, class_name, is_teacher, email_verified, email_verify_token, email_verify_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, display_name, class_name, is_teacher`,
      [email.toLowerCase(), passwordHash, displayName.trim(), finalClassName, isTeacher, emailVerified, verifyToken, verifyExpires]
    );

    const user = result.rows[0];

    if (useEmailVerification) {
      await sendVerificationEmail(user.email, user.display_name, verifyToken).catch((e) =>
        console.error('[mailer] dogrulama e-postasi gonderilemedi:', e.message)
      );
      return res.status(201).json({ pending: true, email: user.email });
    }

    req.session.userId = user.id;
    req.session.ownerUnlocked = user.is_teacher === true;

    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      className: user.class_name,
      isTeacher: user.is_teacher,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayit sirasinda bir hata olustu.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-posta ve sifre zorunludur.' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, is_teacher, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'E-posta veya sifre yanlis.' });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'E-postani dogrulamaniz gerekiyor. Gelen kutunu kontrol et.',
        needsVerification: true,
        email: user.email,
      });
    }

    req.session.userId = user.id;
    req.session.ownerUnlocked = user.is_teacher === true;
    res.json({ id: user.id, email: user.email, displayName: user.display_name, isTeacher: user.is_teacher === true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Giris sirasinda bir hata olustu.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Giris yapilmamis.' });
  }
  const result = await pool.query(
    'SELECT id, email, display_name, class_name, total_study_seconds, is_teacher, created_at FROM users WHERE id = $1',
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Giris yapilmamis.' });
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    className: user.class_name,
    totalStudySeconds: user.total_study_seconds,
    isOwner: user.is_teacher === true,
    createdAt: user.created_at,
  });
});

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/verify-email.html?error=missing');

  try {
    const result = await pool.query(
      'SELECT id, is_teacher FROM users WHERE email_verify_token = $1 AND email_verify_expires > NOW()',
      [token]
    );
    const user = result.rows[0];
    if (!user) return res.redirect('/verify-email.html?error=invalid');

    await pool.query(
      'UPDATE users SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL WHERE id = $1',
      [user.id]
    );

    req.session.userId = user.id;
    req.session.ownerUnlocked = user.is_teacher === true;
    res.redirect(user.is_teacher ? '/admin.html' : '/decks.html');
  } catch (err) {
    console.error(err);
    res.redirect('/verify-email.html?error=server');
  }
});

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'E-posta zorunludur.' });

  try {
    const result = await pool.query(
      'SELECT id, display_name, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || user.email_verified) {
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );
    await sendVerificationEmail(email.toLowerCase(), user.display_name, token).catch((e) =>
      console.error('[mailer] yeniden gonderme hatasi:', e.message)
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bir hata olustu.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'E-posta zorunludur.' });

  try {
    const result = await pool.query(
      'SELECT id, display_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query(
        'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
        [token, expires, user.id]
      );
      await sendPasswordResetEmail(email.toLowerCase(), user.display_name, token).catch((e) =>
        console.error('[mailer] sifre sifirlama e-postasi gonderilemedi:', e.message)
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bir hata olustu.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token ve yeni sifre zorunludur.' });
  if (password.length < 8) return res.status(400).json({ error: 'Sifre en az 8 karakter olmali.' });

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [token]
    );
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Gecersiz veya suresi dolmus baglanti.' });

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bir hata olustu.' });
  }
});

module.exports = router;
