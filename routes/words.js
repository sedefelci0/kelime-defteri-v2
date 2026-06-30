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

    // Bir kelimenin "sorusu" diye sabit bir kaydı yok: genel soru havuzunda (exam_questions)
    // kelimenin metni soru kökünde ya da şıklardan birinde geçiyorsa otomatik eşleşir.
    // Noktalama farklarından etkilenmemek için her iki taraf da harf-dışı karakterlerden
    // arındırılıp kelime sınırlarıyla karşılaştırılıyor.
    const { rows } = await pool.query(
      `SELECT w.id, w.english, w.pronunciation, w.turkish_meaning,
              w.english_explanation, w.example_sentence, w.unit,
              COALESCE(up.status, 'new') AS status,
              up.times_correct, up.times_wrong,
              q.id AS question_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
              q.correct_option, q.explanation AS question_explanation, q.source AS question_source
       FROM words w
       LEFT JOIN user_progress up ON up.word_id = w.id AND up.user_id = $${params.length}
       LEFT JOIN LATERAL (
         SELECT eq.* FROM exam_questions eq
         WHERE (' ' || regexp_replace(lower(eq.question_text), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                 LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
            OR (' ' || regexp_replace(lower(eq.option_a), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                 LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
            OR (' ' || regexp_replace(lower(eq.option_b), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                 LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
            OR (' ' || regexp_replace(lower(eq.option_c), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                 LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
            OR (' ' || regexp_replace(lower(eq.option_d), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                 LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
         ORDER BY eq.created_at DESC
         LIMIT 1
       ) q ON true
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
