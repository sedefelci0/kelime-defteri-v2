const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Kullanıcının tüm notlarını listele (en son güncellenen üstte)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, content, updated_at FROM notes
       WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Notlar yüklenirken hata oluştu.' });
  }
});

// Yeni not oluştur
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3)
       RETURNING id, title, content, updated_at`,
      [req.session.userId, (title || '').trim(), content || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Not oluşturulurken hata oluştu.' });
  }
});

// Notu güncelle (sadece kendi notunu güncelleyebilir)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE notes SET title = $1, content = $2, updated_at = now()
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, content, updated_at`,
      [(title || '').trim(), content || '', req.params.id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not bulunamadı.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Not güncellenirken hata oluştu.' });
  }
});

// Notu sil (sadece kendi notunu silebilir)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Not silinirken hata oluştu.' });
  }
});

module.exports = router;
