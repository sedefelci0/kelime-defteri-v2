const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Giriş yapmış kullanıcı için: belirtilen deste (ve varsa ünite) içindeki kelimeler + durum
// Örnek: GET /api/words?deck=5-sinif&unit=1
router.get('/', requireAuth, async (req, res) => {
  try {
    const { deck: deckSlug, unit } = req.query;
    if (!deckSlug) {
      return res.status(400).json({ error: 'deck parametresi zorunludur.' });
    }

    const { rows: deckRows } = await pool.query('SELECT * FROM decks WHERE slug = $1', [deckSlug]);
    const deck = deckRows[0];
    if (!deck) return res.status(404).json({ error: 'Deste bulunamadı.' });
    if (deck.requires_owner && req.session.ownerUnlocked !== true) {
      return res.status(403).json({ error: 'Bu deste şifre ile korunuyor.' });
    }

    const params = [deck.id];
    let unitFilter = '';
    if (unit !== undefined && unit !== '') {
      params.push(Number(unit));
      unitFilter = `AND w.unit = $${params.length}`;
    }
    params.push(req.session.userId);

    const { rows } = await pool.query(
      `SELECT w.id, w.english, w.pronunciation, w.turkish_meaning,
              w.english_explanation, w.example_sentence, w.unit,
              COALESCE(up.status, 'new') AS status,
              up.times_correct, up.times_wrong
       FROM words w
       LEFT JOIN user_progress up ON up.word_id = w.id AND up.user_id = $${params.length}
       WHERE w.deck_id = $1 ${unitFilter}
       ORDER BY w.id ASC`,
      params
    );

    res.json({
      deck: {
        slug: deck.slug,
        title: deck.title,
        hasExplanation: deck.has_explanation,
      },
      words: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kelimeler yüklenirken hata oluştu.' });
  }
});

module.exports = router;
