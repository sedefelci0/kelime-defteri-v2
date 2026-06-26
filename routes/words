const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Giriş yapmış kullanıcı için: tüm kelimeler + her birinin durumu (new/learning/known)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.english, w.pronunciation, w.turkish_meaning,
              w.english_explanation, w.example_sentence,
              COALESCE(up.status, 'new') AS status,
              up.times_correct, up.times_wrong
       FROM words w
       LEFT JOIN user_progress up ON up.word_id = w.id AND up.user_id = $1
       ORDER BY w.id ASC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kelimeler yüklenirken hata oluştu.' });
  }
});

module.exports = router;
