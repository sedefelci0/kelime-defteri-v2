const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { STUDENT_CLASSES, TEACHER_LABEL } = require('../db/classes-config');

const router = express.Router();

function requireOwner(req, res, next) {
  if (req.session.ownerUnlocked !== true) {
    return res.status(403).json({ error: 'Bu sayfa için öğretmen girişi gerekiyor.' });
  }
  next();
}

// Sınıf listesi (öğretmen hariç, sadece gerçek öğrenci sınıfları — filtre dropdown'u için)
router.get('/classes', requireAuth, requireOwner, (req, res) => {
  res.json(STUDENT_CLASSES);
});

// Tüm öğrencileri (öğretmen hesapları hariç, ve istersen tek bir sınıfı) ilerleme özetiyle listele
router.get('/students', requireAuth, requireOwner, async (req, res) => {
  try {
    const { class: classFilter } = req.query;

    const params = [TEACHER_LABEL];
    let classWhere = 'WHERE (u.class_name IS DISTINCT FROM $1)';
    if (classFilter) {
      params.push(classFilter);
      classWhere += ` AND u.class_name = $${params.length}`;
    }

    const { rows: students } = await pool.query(
      `SELECT u.id, u.display_name, u.email, u.class_name, u.total_study_seconds,
              COALESCE(SUM(up.times_correct), 0)::int AS total_correct,
              COALESCE(SUM(up.times_wrong), 0)::int AS total_wrong
       FROM users u
       LEFT JOIN user_progress up ON up.user_id = u.id
       ${classWhere}
       GROUP BY u.id
       ORDER BY u.class_name ASC, u.display_name ASC`,
      params
    );

    if (students.length === 0) return res.json([]);

    const ids = students.map((s) => s.id);
    const { rows: notes } = await pool.query(
      `SELECT id, user_id, title, content, updated_at FROM notes
       WHERE user_id = ANY($1) ORDER BY updated_at DESC`,
      [ids]
    );

    const notesByUser = {};
    for (const n of notes) {
      if (!notesByUser[n.user_id]) notesByUser[n.user_id] = [];
      notesByUser[n.user_id].push({ id: n.id, title: n.title, content: n.content, updatedAt: n.updated_at });
    }

    res.json(
      students.map((s) => ({
        id: s.id,
        displayName: s.display_name,
        email: s.email,
        className: s.class_name,
        totalStudySeconds: s.total_study_seconds,
        totalCorrect: s.total_correct,
        totalWrong: s.total_wrong,
        notes: notesByUser[s.id] || [],
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Öğrenciler yüklenirken hata oluştu.' });
  }
});

// --- Soru yönetimi ---

// Soru eklemek için kelime arama: deste zorunlu, ünite ve arama metni opsiyonel
router.get('/words', requireAuth, requireOwner, async (req, res) => {
  try {
    const { deck: deckSlug, unit, search } = req.query;
    if (!deckSlug) return res.status(400).json({ error: 'deck parametresi zorunludur.' });

    const { rows: deckRows } = await pool.query('SELECT id FROM decks WHERE slug = $1', [deckSlug]);
    const deck = deckRows[0];
    if (!deck) return res.status(404).json({ error: 'Deste bulunamadı.' });

    const params = [deck.id];
    let filter = '';
    if (unit !== undefined && unit !== '') {
      params.push(Number(unit));
      filter += ` AND unit = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      filter += ` AND (english ILIKE $${params.length} OR turkish_meaning ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT id, english, turkish_meaning, unit FROM words WHERE deck_id = $1 ${filter} ORDER BY id ASC LIMIT 50`,
      params
    );
    res.json(rows.map((w) => ({ id: w.id, english: w.english, turkishMeaning: w.turkish_meaning, unit: w.unit })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kelimeler yüklenirken hata oluştu.' });
  }
});

// Eklenmiş soruları (isteğe bağlı deste filtresiyle) listele
router.get('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const { deck: deckSlug } = req.query;
    const params = [];
    let deckFilter = '';
    if (deckSlug) {
      params.push(deckSlug);
      deckFilter = `WHERE d.slug = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT q.id, q.word_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
              q.correct_option, q.explanation, q.source, q.created_at,
              w.english AS word_english, w.unit AS word_unit, d.title AS deck_title
       FROM questions q
       JOIN words w ON w.id = q.word_id
       JOIN decks d ON d.id = w.deck_id
       ${deckFilter}
       ORDER BY q.created_at DESC`,
      params
    );
    res.json(
      rows.map((q) => ({
        id: q.id,
        wordId: q.word_id,
        wordEnglish: q.word_english,
        wordUnit: q.word_unit,
        deckTitle: q.deck_title,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        correctOption: q.correct_option,
        explanation: q.explanation,
        source: q.source,
        createdAt: q.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sorular yüklenirken hata oluştu.' });
  }
});

function validateQuestionBody(body) {
  const { wordId, questionText, optionA, optionB, optionC, optionD, correctOption } = body || {};
  if (!Number.isInteger(Number(wordId))) return 'Geçerli bir kelime seçmelisin.';
  if (!questionText || !questionText.trim()) return 'Soru metni zorunludur.';
  if (!optionA || !optionB || !optionC || !optionD) return '4 şıkkın hepsi doldurulmalı.';
  if (!['A', 'B', 'C', 'D'].includes(correctOption)) return 'Doğru şık A/B/C/D olmalı.';
  return null;
}

router.post('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { wordId, questionText, optionA, optionB, optionC, optionD, correctOption, explanation, source } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO questions (word_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        Number(wordId),
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru kaydedilirken hata oluştu.' });
  }
});

router.put('/questions/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz soru id.' });

    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { wordId, questionText, optionA, optionB, optionC, optionD, correctOption, explanation, source } = req.body;
    const { rowCount } = await pool.query(
      `UPDATE questions SET word_id = $1, question_text = $2, option_a = $3, option_b = $4, option_c = $5,
              option_d = $6, correct_option = $7, explanation = $8, source = $9
       WHERE id = $10`,
      [
        Number(wordId),
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
        id,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Soru bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru güncellenirken hata oluştu.' });
  }
});

router.delete('/questions/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz soru id.' });
    const { rowCount } = await pool.query('DELETE FROM questions WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Soru bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru silinirken hata oluştu.' });
  }
});

module.exports = router;
