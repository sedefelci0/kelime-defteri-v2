const express = require('express');
const pool = require('../db/pool');
const DECKS = require('../db/decks-config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Tüm desteleri listele. Sahibe özel (requires_owner) desteler, sadece bu oturumda
// şifre ile açılmışsa listeye dahil edilir; aksi halde öğrenciler bunların var olduğunu
// bile görmez.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.slug, d.title, d.description, d.requires_owner, d.has_explanation,
              COUNT(DISTINCT w.unit) FILTER (WHERE w.unit IS NOT NULL) AS unit_count,
              COUNT(w.id) AS word_count
       FROM decks d
       LEFT JOIN words w ON w.deck_id = d.id
       GROUP BY d.id
       ORDER BY d.sort_order ASC`
    );

    const visible = rows.filter((d) => !d.requires_owner || req.session.ownerUnlocked === true);
    res.json(visible.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      hasExplanation: d.has_explanation,
      unitCount: Number(d.unit_count),
      wordCount: Number(d.word_count),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Desteler yüklenirken hata oluştu.' });
  }
});

// Bir destenin ünitelerini listele (örn. 5. Sınıf -> [1, 2, 3])
router.get('/:slug/units', requireAuth, async (req, res) => {
  try {
    const { rows: deckRows } = await pool.query('SELECT * FROM decks WHERE slug = $1', [req.params.slug]);
    const deck = deckRows[0];
    if (!deck) return res.status(404).json({ error: 'Deste bulunamadı.' });
    if (deck.requires_owner && req.session.ownerUnlocked !== true) {
      return res.status(403).json({ error: 'Bu deste şifre ile korunuyor.' });
    }

    const { rows } = await pool.query(
      `SELECT unit, COUNT(*)::int AS word_count
       FROM words WHERE deck_id = $1 AND unit IS NOT NULL
       GROUP BY unit ORDER BY unit ASC`,
      [deck.id]
    );
    const deckConfig = DECKS.find((d) => d.slug === req.params.slug);
    const unitNames = deckConfig?.unitNames || {};
    res.json(rows.map((r) => ({ unit: r.unit, wordCount: r.word_count, name: unitNames[r.unit] || null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Üniteler yüklenirken hata oluştu.' });
  }
});

// Sahibe özel desteyi bu oturum için aç
router.post('/unlock', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.OWNER_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'Sunucu yapılandırması eksik (OWNER_PASSWORD tanımlı değil).' });
  }
  if (!password || password.trim() !== expected.trim()) {
    return res.status(401).json({ error: 'Şifre yanlış.' });
  }
  req.session.ownerUnlocked = true;
  res.json({ ok: true });
});

module.exports = router;
