const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Genel özet: kaç kelime new / learning / known
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM words) AS total,
         COALESCE(SUM(CASE WHEN up.status = 'known' THEN 1 ELSE 0 END), 0)::int AS known,
         COALESCE(SUM(CASE WHEN up.status = 'learning' THEN 1 ELSE 0 END), 0)::int AS learning
       FROM user_progress up WHERE up.user_id = $1`,
      [req.session.userId]
    );
    const row = rows[0];
    const known = Number(row.known) || 0;
    const learning = Number(row.learning) || 0;
    const total = Number(row.total) || 0;
    res.json({ total, known, learning, newCount: total - known - learning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Özet yüklenirken hata oluştu.' });
  }
});

// Bir kelimeyi "biliyorum" veya "tekrar göster" olarak işaretle
router.post('/:wordId', requireAuth, async (req, res) => {
  try {
    const wordId = Number(req.params.wordId);
    const { knewIt } = req.body || {};

    if (!Number.isInteger(wordId)) {
      return res.status(400).json({ error: 'Geçersiz kelime id.' });
    }
    if (typeof knewIt !== 'boolean') {
      return res.status(400).json({ error: 'knewIt alanı (true/false) zorunludur.' });
    }

    // Basit kural: art arda 2 kez doğru bilinirse "known" olur.
    // Bir kere bile yanlış bilinirse "learning"e döner.
    const existing = await pool.query(
      'SELECT times_correct, times_wrong FROM user_progress WHERE user_id = $1 AND word_id = $2',
      [req.session.userId, wordId]
    );

    let timesCorrect = existing.rows[0]?.times_correct || 0;
    let timesWrong = existing.rows[0]?.times_wrong || 0;

    if (knewIt) {
      timesCorrect += 1;
    } else {
      timesWrong += 1;
    }

    const status = !knewIt ? 'learning' : timesCorrect >= 2 ? 'known' : 'learning';

    await pool.query(
      `INSERT INTO user_progress (user_id, word_id, status, times_correct, times_wrong, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, word_id)
       DO UPDATE SET status = $3, times_correct = $4, times_wrong = $5, last_reviewed_at = now()`,
      [req.session.userId, wordId, status, timesCorrect, timesWrong]
    );

    res.json({ wordId, status, timesCorrect, timesWrong });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İlerleme kaydedilirken hata oluştu.' });
  }
});

module.exports = router;
