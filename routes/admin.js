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

// --- Soru havuzu yönetimi (exam_questions: kelimeye bağlı değil, genel havuz) ---

// Havuzdaki tüm soruları listele (en yeni önce)
router.get('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, option_e,
              correct_option, explanation, source, restrict_deck_slug, created_at
       FROM exam_questions
       ORDER BY created_at DESC`
    );
    res.json(
      rows.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        optionE: q.option_e,
        correctOption: q.correct_option,
        explanation: q.explanation,
        source: q.source,
        restrictDeckSlug: q.restrict_deck_slug,
        createdAt: q.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sorular yüklenirken hata oluştu.' });
  }
});

function validateQuestionBody(body) {
  const { questionText, optionA, optionB, optionC, optionD, correctOption } = body || {};
  if (!questionText || !questionText.trim()) return 'Soru metni zorunludur.';
  if (!optionA || !optionB || !optionC || !optionD) return '4 şıkkın hepsi doldurulmalı.';
  if (!['A', 'B', 'C', 'D', 'E'].includes(correctOption)) return 'Doğru şık A/B/C/D/E olmalı.';
  return null;
}

router.post('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { questionText, optionA, optionB, optionC, optionD, optionE, correctOption, explanation, source, restrictDeckSlug } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO exam_questions (question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, source, restrict_deck_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        optionE && optionE.trim() ? optionE.trim() : null,
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
        restrictDeckSlug ? restrictDeckSlug.trim() : null,
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

    const { questionText, optionA, optionB, optionC, optionD, optionE, correctOption, explanation, source, restrictDeckSlug } = req.body;
    const { rowCount } = await pool.query(
      `UPDATE exam_questions SET question_text = $1, option_a = $2, option_b = $3, option_c = $4,
              option_d = $5, option_e = $6, correct_option = $7, explanation = $8, source = $9, restrict_deck_slug = $10
       WHERE id = $11`,
      [
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        optionE && optionE.trim() ? optionE.trim() : null,
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
        restrictDeckSlug ? restrictDeckSlug.trim() : null,
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
    const { rowCount } = await pool.query('DELETE FROM exam_questions WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Soru bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru silinirken hata oluştu.' });
  }
});

module.exports = router;
