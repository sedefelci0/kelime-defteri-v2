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
    const userIdParamIndex = params.length;
    params.push(deckSlug);
    const deckSlugParamIndex = params.length;

    // Her kelime için eşleşen TÜM sınavı sorularını JSON dizisi olarak döner.
    // restrict_deck_slug IS NULL → kısıtsız (tüm desteler görebilir, örn. LGS soruları).
    // restrict_deck_slug = deck slug → sadece o deste.
    // yokdil destesi için benim-kelimelerim'e kısıtlı YDS/YÖKDİL soruları da dahil edilir;
    // bu iki deste aynı seviyedir ve kelime eşleşmesi zaten alakasız soruları ezer.
    const { rows } = await pool.query(
      `SELECT w.id, w.english, w.pronunciation, w.turkish_meaning,
              w.english_explanation, w.example_sentence, w.unit,
              COALESCE(up.status, 'new') AS status,
              up.times_correct, up.times_wrong,
              COALESCE(
                (SELECT json_agg(
                   json_build_object(
                     'id', eq.id,
                     'question_text', eq.question_text,
                     'option_a', eq.option_a,
                     'option_b', eq.option_b,
                     'option_c', eq.option_c,
                     'option_d', eq.option_d,
                     'option_e', eq.option_e,
                     'correct_option', eq.correct_option,
                     'explanation', eq.explanation,
                     'source', eq.source
                   ) ORDER BY eq.created_at DESC
                 )
                 FROM exam_questions eq
                 WHERE (
                   eq.restrict_deck_slug IS NULL
                   OR eq.restrict_deck_slug = $${deckSlugParamIndex}
                   OR ($${deckSlugParamIndex} = 'yokdil' AND eq.restrict_deck_slug = 'benim-kelimelerim')
                 )
                 AND (
                   (' ' || regexp_replace(lower(eq.question_text), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                      OR (' ' || regexp_replace(lower(eq.option_a), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                      OR (' ' || regexp_replace(lower(eq.option_b), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                      OR (' ' || regexp_replace(lower(eq.option_c), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                      OR (' ' || regexp_replace(lower(eq.option_d), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                      OR (' ' || regexp_replace(lower(COALESCE(eq.option_e, '')), '[^a-zçğıöşü]+', ' ', 'g') || ' ')
                           LIKE ('% ' || regexp_replace(lower(w.english), '[^a-zçğıöşü]+', ' ', 'g') || ' %')
                 )
                ), '[]'::json
              ) AS questions
       FROM words w
       LEFT JOIN user_progress up ON up.word_id = w.id AND up.user_id = $${userIdParamIndex}
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
