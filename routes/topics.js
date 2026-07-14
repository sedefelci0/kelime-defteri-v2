const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const TOPICS_FILE = path.join(__dirname, '../data/grade5_topics.json');

function loadTopics() {
  const raw = fs.readFileSync(TOPICS_FILE, 'utf8');
  return JSON.parse(raw);
}

// Bir ünitenin konu özeti aktivitelerini döner. Kaynağı olmayan üniteler için
// { comingSoon: true } döner (bkz. data/grade5_topics.json).
router.get('/:deckSlug/:unit', requireAuth, (req, res) => {
  try {
    const unit = Number(req.params.unit);
    if (!Number.isInteger(unit)) return res.status(400).json({ error: 'Geçersiz ünite.' });

    const topics = loadTopics();
    const deckTopics = topics[req.params.deckSlug];
    const unitTopics = deckTopics ? deckTopics[String(unit)] : null;

    if (!unitTopics) return res.status(404).json({ error: 'Bu ünite için konu özeti bulunamadı.' });
    if (unitTopics.comingSoon) return res.json({ comingSoon: true, theme: unitTopics.theme || null });

    res.json({ comingSoon: false, theme: unitTopics.theme || null, activities: unitTopics.activities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Konu özeti yüklenirken hata oluştu.' });
  }
});

// Oturum kullanıcısının bu destedeki tüm ünitelerin en iyi skorlarını döner
// (ünite butonlarında rozet göstermek için).
router.get('/:deckSlug/progress', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT unit, best_score, best_total FROM topic_progress
       WHERE user_id = $1 AND deck_slug = $2`,
      [req.session.userId, req.params.deckSlug]
    );
    const byUnit = {};
    rows.forEach((r) => { byUnit[r.unit] = { bestScore: r.best_score, bestTotal: r.best_total }; });
    res.json(byUnit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İlerleme yüklenirken hata oluştu.' });
  }
});

// Bir aktivite setinin tamamlanmasıyla elde edilen skoru kaydeder (en iyi skoru korur).
router.post('/:deckSlug/:unit/complete', requireAuth, async (req, res) => {
  try {
    const unit = Number(req.params.unit);
    const { score, total, details } = req.body || {};
    if (!Number.isInteger(unit)) return res.status(400).json({ error: 'Geçersiz ünite.' });
    if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
      return res.status(400).json({ error: 'Geçersiz skor.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO topic_progress (user_id, deck_slug, unit, best_score, best_total, last_score, last_total, attempts, updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, $5, 1, now())
       ON CONFLICT (user_id, deck_slug, unit) DO UPDATE SET
         best_score = GREATEST(topic_progress.best_score, EXCLUDED.best_score),
         best_total = CASE WHEN EXCLUDED.best_score > topic_progress.best_score
                            THEN EXCLUDED.best_total ELSE topic_progress.best_total END,
         last_score = EXCLUDED.last_score,
         last_total = EXCLUDED.last_total,
         attempts = topic_progress.attempts + 1,
         updated_at = now()
       RETURNING best_score, best_total, attempts`,
      [req.session.userId, req.params.deckSlug, unit, score, total]
    );

    // Soru bazlı doğru/yanlış dökümü — admin panelindeki ünite detay popup'ı için.
    // Her gönderim önceki denemenin dökümünü ezer (en son deneme gösterilir).
    if (Array.isArray(details)) {
      for (const d of details) {
        if (!d || !Number.isInteger(d.index) || !d.type || !d.prompt || typeof d.isCorrect !== 'boolean') continue;
        await pool.query(
          `INSERT INTO topic_activity_results (user_id, deck_slug, unit, activity_index, activity_type, prompt, is_correct, explanation, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (user_id, deck_slug, unit, activity_index) DO UPDATE SET
             activity_type = EXCLUDED.activity_type,
             prompt = EXCLUDED.prompt,
             is_correct = EXCLUDED.is_correct,
             explanation = EXCLUDED.explanation,
             recorded_at = now()`,
          [
            req.session.userId, req.params.deckSlug, unit, d.index, String(d.type).slice(0, 40),
            String(d.prompt).slice(0, 500), d.isCorrect,
            d.explanation ? String(d.explanation).slice(0, 1000) : null,
          ]
        ).catch(() => {});
      }
    }

    res.json({
      bestScore: rows[0].best_score,
      bestTotal: rows[0].best_total,
      attempts: rows[0].attempts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Skor kaydedilirken hata oluştu.' });
  }
});

// Kişisel (açık uçlu) soruya öğrencinin yazdığı cevabı kaydeder — öğretmen admin
// panelinden görebilsin diye. Aynı soruya tekrar gönderim yapılırsa üzerine yazılır.
router.post('/:deckSlug/:unit/personal-answer', requireAuth, async (req, res) => {
  try {
    const unit = Number(req.params.unit);
    const { question, answer } = req.body || {};
    if (!Number.isInteger(unit)) return res.status(400).json({ error: 'Geçersiz ünite.' });
    if (!question || !answer || !answer.trim()) {
      return res.status(400).json({ error: 'Cevap boş olamaz.' });
    }

    await pool.query(
      `INSERT INTO topic_personal_answers (user_id, deck_slug, unit, question, answer, submitted_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, deck_slug, unit, question) DO UPDATE SET
         answer = EXCLUDED.answer,
         submitted_at = now()`,
      [req.session.userId, req.params.deckSlug, unit, question, answer.trim()]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cevap kaydedilirken hata oluştu.' });
  }
});

// Boşluk doldurma sorusu doğru cevaplandığında, kaç denemede çözüldüğünü kaydeder.
router.post('/:deckSlug/:unit/fillblank-attempt', requireAuth, async (req, res) => {
  try {
    const unit = Number(req.params.unit);
    const { prompt, attempts, type } = req.body || {};
    const activityType = type === 'matching' ? 'matching' : 'fill_blank';
    if (!Number.isInteger(unit)) return res.status(400).json({ error: 'Geçersiz ünite.' });
    if (!prompt || !Number.isInteger(attempts) || attempts < 1) {
      return res.status(400).json({ error: 'Geçersiz deneme verisi.' });
    }

    await pool.query(
      `INSERT INTO topic_fillblank_attempts (user_id, deck_slug, unit, prompt, attempts, activity_type, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, deck_slug, unit, prompt) DO UPDATE SET
         attempts = EXCLUDED.attempts,
         activity_type = EXCLUDED.activity_type,
         submitted_at = now()`,
      [req.session.userId, req.params.deckSlug, unit, prompt, attempts, activityType]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deneme kaydedilirken hata oluştu.' });
  }
});

module.exports = router;
