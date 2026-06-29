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

module.exports = router;
