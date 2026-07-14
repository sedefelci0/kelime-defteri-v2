let students = [];

const loadingEl = document.getElementById('loading');
const noAccessEl = document.getElementById('no-access');
const adminContentEl = document.getElementById('admin-content');
const tbodyEl = document.getElementById('students-tbody');
const emptyStudentsEl = document.getElementById('empty-students');
const classFilterEl = document.getElementById('class-filter');
const summaryCardsEl = document.getElementById('summary-cards');

const GRADE5_UNIT_NAMES = {
  1: 'Okul Hayatı', 2: 'Sınıf Hayatı', 3: 'Kişisel Hayat', 4: 'Aile Hayatı',
  5: 'Mahalle ve Şehir Hayatı', 6: 'Dünyada Hayat', 7: 'Doğada Hayat', 8: 'Evren ve Gelecekte Hayat',
};

const AVATAR_COLORS = [
  { bg: '#EEEDFE', fg: '#7C6CE0' },
  { bg: '#E1F5EE', fg: '#2D9B6F' },
  { bg: '#FAECE7', fg: '#D96B38' },
  { bg: '#FEF3DC', fg: '#C99010' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#dbeafe', fg: '#1d4ed8' },
];

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Giriş gerekli');
  }
  if (res.status === 403) {
    showOnly(noAccessEl);
    throw new Error('Erişim yok');
  }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

async function sendJSON(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

function showOnly(el) {
  [loadingEl, noAccessEl, adminContentEl].forEach((e) => {
    e.style.display = e === el ? '' : 'none';
  });
}

function formatDuration(totalSeconds) {
  const mins = Math.floor((totalSeconds || 0) / 60);
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours} sa ${rem} dk`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderStudents() {
  tbodyEl.innerHTML = '';

  const totalQuizCorrect = students.reduce((sum, s) => sum + (s.quizCorrect || 0), 0);
  const totalQuizWrong = students.reduce((sum, s) => sum + (s.quizWrong || 0), 0);
  const totalAns = totalQuizCorrect + totalQuizWrong;
  const accuracy = totalAns > 0 ? Math.round(totalQuizCorrect / totalAns * 100) : 0;

  if (students.length > 0) {
    document.getElementById('sum-students').textContent = students.length;
    document.getElementById('sum-correct').textContent = totalQuizCorrect.toLocaleString('tr-TR');
    document.getElementById('sum-accuracy').textContent = `%${accuracy}`;
    document.getElementById('sum-accuracy').nextElementSibling.textContent =
      `Quiz başarı · ${totalQuizWrong.toLocaleString('tr-TR')} yanlış`;
    summaryCardsEl.style.display = '';
  } else {
    summaryCardsEl.style.display = 'none';
  }

  if (students.length === 0) {
    emptyStudentsEl.style.display = '';
    return;
  }
  emptyStudentsEl.style.display = 'none';

  students.forEach((s, i) => {
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initials = getInitials(s.displayName);
    const quizCorrect = s.quizCorrect || 0;
    const quizWrong = s.quizWrong || 0;
    const examCorrect = s.examCorrect || 0;
    const examWrong = s.examWrong || 0;
    const quizAns = quizCorrect + quizWrong;
    const quizAcc = quizAns > 0 ? Math.round(quizCorrect / quizAns * 100) : 0;
    const examAns = examCorrect + examWrong;
    const examAcc = examAns > 0 ? Math.round(examCorrect / examAns * 100) : null;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="student-cell">
          <div class="student-avatar" style="background:${color.bg};color:${color.fg}">${initials}</div>
          <div>
            <div class="student-name">${s.displayName}</div>
            <div class="student-email">${s.email}</div>
          </div>
        </div>
      </td>
      <td>${s.className ? `<span class="class-badge">${s.className}</span>` : '<span class="muted-dash">—</span>'}</td>
      <td>${formatDuration(s.totalStudySeconds)}</td>
      <td>
        <span class="score-correct">${quizCorrect}</span>
        <span class="score-sep"> / </span>
        <span class="${quizWrong === 0 ? 'score-wrong-zero' : 'score-wrong'}">${quizWrong}</span>
      </td>
      <td>
        ${examAns > 0
          ? `<span class="score-correct">${examCorrect}</span><span class="score-sep"> / </span><span class="${examWrong === 0 ? 'score-wrong-zero' : 'score-wrong'}">${examWrong}</span>`
          : '<span class="muted-dash">—</span>'}
      </td>
      <td>
        <div class="accuracy-cell">
          <div class="accuracy-bar-track">
            <div class="accuracy-bar-fill" style="width:${quizAcc}%"></div>
          </div>
          <span class="accuracy-pct">%${quizAcc}</span>
          ${examAcc !== null ? `<span class="accuracy-exam-pct">Sınav %${examAcc}</span>` : ''}
        </div>
      </td>
      <td>
        <button class="notes-count-btn topic-detail-btn" ${s.topicUnitsCompleted === 0 ? 'disabled' : ''}>
          ${s.topicUnitsCompleted > 0 ? `${s.topicUnitsCompleted} ünite · %${s.topicAvgPercent}` : '0 ünite'}
        </button>
      </td>
      <td><button class="notes-count-btn personal-answers-count-btn" ${s.personalAnswers.length === 0 ? 'disabled' : ''}>${s.personalAnswers.length} cevap</button></td>
      <td><button class="notes-count-btn notes-only-btn" ${s.notes.length === 0 ? 'disabled' : ''}>${s.notes.length} not</button></td>
      <td><button class="btn-reset-student" type="button">Sıfırla</button></td>
    `;
    tr.querySelector('.notes-only-btn').addEventListener('click', () => {
      if (s.notes.length > 0) openNotesModal(s);
    });
    tr.querySelector('.topic-detail-btn').addEventListener('click', () => {
      if (s.topicUnitsCompleted > 0) openTopicDetailModal(s);
    });
    tr.querySelector('.btn-reset-student').addEventListener('click', () => resetStudent(s));
    tr.querySelector('.personal-answers-count-btn').addEventListener('click', () => {
      if (s.personalAnswers.length > 0) openPersonalAnswersModal(s);
    });
    tbodyEl.appendChild(tr);
  });
}

async function loadStudents(classFilter) {
  try {
    const url = classFilter ? `/api/admin/students?class=${encodeURIComponent(classFilter)}` : '/api/admin/students';
    students = await getJSON(url);
    renderStudents();
  } catch (err) {
    // 401/403 zaten yönlendirdi ya da no-access gösterdi
  }
}

async function loadClassFilterOptions() {
  try {
    const classes = await getJSON('/api/admin/classes');
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      classFilterEl.appendChild(opt);
    });
  } catch (err) {
    // sessizce geç
  }
}

classFilterEl.addEventListener('change', () => {
  loadStudents(classFilterEl.value);
});

// Notlar modalı
const notesModal = document.getElementById('notes-modal');
const notesModalTitle = document.getElementById('notes-modal-title');
const notesModalList = document.getElementById('notes-modal-list');

function openNotesModal(student) {
  notesModalTitle.textContent = `${student.displayName} — Notlar`;
  notesModalList.innerHTML = '';
  student.notes.forEach((note) => {
    const div = document.createElement('div');
    div.className = 'notes-modal-note';
    const title = note.title && note.title.trim() ? note.title : '(Başlıksız not)';
    div.innerHTML = `
      <div class="note-title">${title}</div>
      <div class="note-content">${(note.content || '').replace(/</g, '&lt;')}</div>
      <div class="note-date">${formatDate(note.updatedAt)}</div>
    `;
    notesModalList.appendChild(div);
  });
  notesModal.style.display = 'flex';
}

document.getElementById('notes-modal-close').addEventListener('click', () => {
  notesModal.style.display = 'none';
});

// Kişisel Cevaplar modalı
const personalAnswersModal = document.getElementById('personal-answers-modal');
const personalAnswersModalTitle = document.getElementById('personal-answers-modal-title');
const personalAnswersModalList = document.getElementById('personal-answers-modal-list');

function openPersonalAnswersModal(student) {
  personalAnswersModalTitle.textContent = `${student.displayName} — Kişisel Cevaplar`;
  personalAnswersModalList.innerHTML = '';
  student.personalAnswers.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'notes-modal-note';
    const unitLabel = GRADE5_UNIT_NAMES[a.unit] ? `Ünite ${a.unit} — ${GRADE5_UNIT_NAMES[a.unit]}` : `Ünite ${a.unit}`;
    div.innerHTML = `
      <div class="note-title">${unitLabel}</div>
      <div class="note-content"><em>${a.question}</em><br>${(a.answer || '').replace(/</g, '&lt;')}</div>
      <div class="note-date">${formatDate(a.submittedAt)}</div>
    `;
    personalAnswersModalList.appendChild(div);
  });
  personalAnswersModal.style.display = 'flex';
}

document.getElementById('personal-answers-modal-close').addEventListener('click', () => {
  personalAnswersModal.style.display = 'none';
});

// Konu Özetleri detay modalı (ünite bazında skor + boşluk doldurma denemeleri)
const topicDetailModal = document.getElementById('topic-detail-modal');
const topicDetailModalTitle = document.getElementById('topic-detail-modal-title');
const topicDetailModalList = document.getElementById('topic-detail-modal-list');

function openTopicDetailModal(student) {
  topicDetailModalTitle.textContent = `${student.displayName} — Konu Özetleri`;
  topicDetailModalList.innerHTML = '';

  const sorted = [...student.topicProgressDetail].sort((a, b) => a.unit - b.unit);
  sorted.forEach((t) => {
    const div = document.createElement('div');
    div.className = 'notes-modal-note';
    const unitLabel = GRADE5_UNIT_NAMES[t.unit] ? `Ünite ${t.unit} — ${GRADE5_UNIT_NAMES[t.unit]}` : `Ünite ${t.unit}`;
    const pct = t.bestTotal > 0 ? Math.round((t.bestScore / t.bestTotal) * 100) : 0;
    div.innerHTML = `
      <div class="note-title">${unitLabel}</div>
      <div class="note-content">${t.bestScore} / ${t.bestTotal} doğru (%${pct}) · ${t.attempts} deneme</div>
    `;
    topicDetailModalList.appendChild(div);
  });

  if (student.fillBlank) {
    const fb = student.fillBlank;
    const div = document.createElement('div');
    div.className = 'notes-modal-note';
    const firstTryPct = fb.total > 0 ? Math.round((fb.firstTry / fb.total) * 100) : 0;
    div.innerHTML = `
      <div class="note-title">Boşluk Doldurma</div>
      <div class="note-content">${fb.total} soru · %${firstTryPct} ilk denemede doğru · ortalama ${fb.avgAttempts} deneme</div>
    `;
    topicDetailModalList.appendChild(div);
  }

  topicDetailModal.style.display = 'flex';
}

document.getElementById('topic-detail-modal-close').addEventListener('click', () => {
  topicDetailModal.style.display = 'none';
});

// --- Veri sıfırlama ---
async function resetStudent(student) {
  if (!confirm(`${student.displayName} adlı öğrencinin tüm quiz, sınav, çalışma süresi, konu özeti, kişisel cevap ve not verilerini silmek istediğine emin misin? Bu işlem geri alınamaz.`)) {
    return;
  }
  try {
    await sendJSON(`/api/admin/students/${student.id}/reset`, 'POST');
    await loadStudents(classFilterEl.value);
  } catch (err) {
    alert(err.message || 'Sıfırlanırken hata oluştu.');
  }
}

document.getElementById('reset-all-btn').addEventListener('click', async () => {
  if (students.length === 0) return;
  if (!confirm(`Listelenen ${students.length} öğrencinin TÜMÜNÜN verilerini sıfırlamak istediğine emin misin? Bu işlem geri alınamaz.`)) {
    return;
  }
  try {
    await sendJSON('/api/admin/students/reset-all', 'POST');
    await loadStudents(classFilterEl.value);
  } catch (err) {
    alert(err.message || 'Toplu sıfırlama sırasında hata oluştu.');
  }
});

document.getElementById('back-to-decks-btn').addEventListener('click', () => {
  window.location.href = '/decks.html';
});
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// --- Sekmeler ---
const tabBtnStudents  = document.getElementById('tab-btn-students');
const tabBtnQuestions = document.getElementById('tab-btn-questions');
const tabBtnRequests  = document.getElementById('tab-btn-requests');
const tabBtnAnalytics = document.getElementById('tab-btn-analytics');
const tabStudents     = document.getElementById('tab-students');
const tabQuestions    = document.getElementById('tab-questions');
const tabRequests     = document.getElementById('tab-requests');
const tabAnalytics    = document.getElementById('tab-analytics');

let analyticsLoaded = false;

function activateTab(name) {
  [tabBtnStudents, tabBtnQuestions, tabBtnRequests, tabBtnAnalytics].forEach((b, i) => {
    const names = ['students', 'questions', 'requests', 'analytics'];
    b.classList.toggle('is-active', names[i] === name);
  });
  tabStudents.style.display   = name === 'students'  ? '' : 'none';
  tabQuestions.style.display  = name === 'questions' ? '' : 'none';
  tabRequests.style.display   = name === 'requests'  ? '' : 'none';
  tabAnalytics.style.display  = name === 'analytics' ? '' : 'none';

  if (name === 'questions' && !questionsLoaded) {
    loadDecksForRestrictOptions();
    loadAllQuestions();
  }
  if (name === 'requests') loadWordRequests();
  if (name === 'analytics' && !analyticsLoaded) loadAnalytics();
}

tabBtnStudents.addEventListener('click',  () => activateTab('students'));
tabBtnQuestions.addEventListener('click', () => activateTab('questions'));
tabBtnRequests.addEventListener('click',  () => activateTab('requests'));
tabBtnAnalytics.addEventListener('click', () => activateTab('analytics'));

// --- Analitik sekmesi ---
async function loadAnalytics() {
  const loadingEl = document.getElementById('analytics-loading');
  const contentEl = document.getElementById('analytics-content');
  loadingEl.style.display = '';
  contentEl.style.display = 'none';
  try {
    const data = await getJSON('/api/admin/analytics');
    renderAnalytics(data);
    analyticsLoaded = true;
    loadingEl.style.display = 'none';
    contentEl.style.display = '';
  } catch (err) {
    loadingEl.textContent = 'Yüklenemedi.';
  }
}

function renderAnalytics(data) {
  const { users, classDistribution, mostStudied, hardestWords, easiestWords } = data;

  // Kullanıcı kartları
  const userCardsEl = document.getElementById('analytics-user-cards');
  userCardsEl.innerHTML = `
    <div class="analytics-stat-card">
      <div class="analytics-stat-value">${users.total_users}</div>
      <div class="analytics-stat-label">Toplam Öğrenci</div>
    </div>
    <div class="analytics-stat-card analytics-stat-card--green">
      <div class="analytics-stat-value">${users.active_7d}</div>
      <div class="analytics-stat-label">Son 7 Günde Aktif</div>
    </div>
    <div class="analytics-stat-card analytics-stat-card--blue">
      <div class="analytics-stat-value">${users.active_today}</div>
      <div class="analytics-stat-label">Bugün Çalışan</div>
    </div>
  `;

  // Sınıf dağılımı bar chart
  const chartEl = document.getElementById('class-dist-chart');
  if (classDistribution.length) {
    const maxCount = Math.max(...classDistribution.map((r) => r.count));
    chartEl.innerHTML = classDistribution.map((r) => {
      const pct = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0;
      return `
        <div class="dist-bar-row">
          <span class="dist-bar-label">${r.class_name}</span>
          <div class="dist-bar-track"><div class="dist-bar-fill" style="width:${pct}%"></div></div>
          <span class="dist-bar-count">${r.count}</span>
        </div>
      `;
    }).join('');
  }

  // En zorlanılan kelimeler
  const hardestTbody = document.querySelector('#hardest-words-table tbody');
  hardestTbody.innerHTML = hardestWords.map((w) => `
    <tr>
      <td class="word-en">${w.english}</td>
      <td><span class="score-wrong">${w.total_wrong}</span></td>
      <td>${w.accuracy !== null ? `%${w.accuracy}` : '—'}</td>
    </tr>
  `).join('');

  // En çok doğru yapılan
  const easiestTbody = document.querySelector('#easiest-words-table tbody');
  easiestTbody.innerHTML = easiestWords.map((w) => `
    <tr>
      <td class="word-en">${w.english}</td>
      <td><span class="score-correct">${w.total_correct}</span></td>
      <td style="font-size:12px;color:var(--muted)">${w.deck_title}</td>
    </tr>
  `).join('');

  // En çok çalışılan
  const studiedTbody = document.querySelector('#most-studied-table tbody');
  studiedTbody.innerHTML = mostStudied.map((w) => `
    <tr>
      <td class="word-en">${w.english}</td>
      <td style="font-size:13px;color:var(--muted)">${w.turkish_meaning}</td>
      <td style="font-size:12px;color:var(--muted)">${w.deck_title}</td>
      <td><strong>${w.times_studied}</strong></td>
    </tr>
  `).join('');
}

// --- Kelime Talepleri sekmesi ---
const requestsListEl = document.getElementById('requests-list');
const requestsEmptyEl = document.getElementById('requests-empty-hint');
const requestsBadgeEl = document.getElementById('requests-badge');
let wordRequestsCache = [];

async function loadWordRequests() {
  try {
    wordRequestsCache = await getJSON('/api/admin/word-requests');
    renderWordRequests();
  } catch (err) {
    // sessizce geç
  }
}

function updateRequestsBadge() {
  if (wordRequestsCache.length > 0) {
    requestsBadgeEl.textContent = wordRequestsCache.length;
    requestsBadgeEl.style.display = '';
  } else {
    requestsBadgeEl.style.display = 'none';
  }
}

function renderWordRequests() {
  updateRequestsBadge();
  requestsListEl.innerHTML = '';
  if (wordRequestsCache.length === 0) {
    requestsEmptyEl.style.display = '';
    return;
  }
  requestsEmptyEl.style.display = 'none';
  wordRequestsCache.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'request-item';
    item.innerHTML = `
      <div>
        <div class="request-word">${r.word}</div>
        <div class="request-meta">${r.userName || 'Bilinmeyen'} · ${r.className || '—'} · ${formatDate(r.requestedAt)}</div>
      </div>
      <div class="request-actions">
        <button class="req-approve-btn" type="button">Onayla</button>
        <button class="req-reject-btn" type="button">Reddet</button>
      </div>
    `;
    item.querySelector('.req-approve-btn').addEventListener('click', () => approveRequest(r.id));
    item.querySelector('.req-reject-btn').addEventListener('click', () => rejectRequest(r.id));
    requestsListEl.appendChild(item);
  });
}

async function approveRequest(id) {
  try {
    await sendJSON(`/api/admin/word-requests/${id}/approve`, 'POST');
    wordRequestsCache = wordRequestsCache.filter((r) => r.id !== id);
    renderWordRequests();
  } catch (err) {
    alert(err.message || 'Onaylanırken hata oluştu.');
  }
}

async function rejectRequest(id) {
  if (!confirm('Bu talebi reddet ve sil?')) return;
  try {
    await sendJSON(`/api/admin/word-requests/${id}/reject`, 'POST');
    wordRequestsCache = wordRequestsCache.filter((r) => r.id !== id);
    renderWordRequests();
  } catch (err) {
    alert(err.message || 'Reddedilirken hata oluştu.');
  }
}

// --- Soru Ekle sekmesi (genel soru havuzu, kelimeye bağlı değil) ---
const qQuestionText = document.getElementById('q-question-text');
const qOptionA = document.getElementById('q-option-a');
const qOptionB = document.getElementById('q-option-b');
const qOptionC = document.getElementById('q-option-c');
const qOptionD = document.getElementById('q-option-d');
const qOptionE = document.getElementById('q-option-e');
const qCorrectOption = document.getElementById('q-correct-option');
const qExplanation = document.getElementById('q-explanation');
const qSource = document.getElementById('q-source');
const qRestrictDeck = document.getElementById('q-restrict-deck');
const qFormError = document.getElementById('q-form-error');
const qFormTitle = document.getElementById('q-form-title');
const qSaveBtn = document.getElementById('q-save-btn');
const qCancelEditBtn = document.getElementById('q-cancel-edit-btn');
const questionsListEl = document.getElementById('questions-list');
const questionsEmptyHintEl = document.getElementById('questions-empty-hint');

let editingQuestionId = null;
let questionsLoaded = false;
let decksForRestrictLoaded = false;
const deckTitleBySlug = {};

async function loadDecksForRestrictOptions() {
  if (decksForRestrictLoaded) return;
  try {
    const decks = await getJSON('/api/decks');
    decks.forEach((d) => {
      deckTitleBySlug[d.slug] = d.title;
      const opt = document.createElement('option');
      opt.value = d.slug;
      opt.textContent = `Sadece: ${d.title}`;
      qRestrictDeck.appendChild(opt);
    });
    decksForRestrictLoaded = true;
    renderQuestionsList();
  } catch (err) {
    // sessizce geç
  }
}

function resetQuestionForm() {
  editingQuestionId = null;
  qFormTitle.textContent = 'Yeni Soru Ekle';
  qSaveBtn.textContent = 'Kaydet';
  qCancelEditBtn.style.display = 'none';
  qQuestionText.value = '';
  qOptionA.value = '';
  qOptionB.value = '';
  qOptionC.value = '';
  qOptionD.value = '';
  qOptionE.value = '';
  qCorrectOption.value = 'A';
  qExplanation.value = '';
  qSource.value = '';
  qRestrictDeck.value = '';
  qFormError.style.display = 'none';
}

qCancelEditBtn.addEventListener('click', resetQuestionForm);

qSaveBtn.addEventListener('click', async () => {
  qFormError.style.display = 'none';

  const body = {
    questionText: qQuestionText.value.trim(),
    optionA: qOptionA.value.trim(),
    optionB: qOptionB.value.trim(),
    optionC: qOptionC.value.trim(),
    optionD: qOptionD.value.trim(),
    optionE: qOptionE.value.trim(),
    correctOption: qCorrectOption.value,
    explanation: qExplanation.value.trim(),
    source: qSource.value.trim(),
    restrictDeckSlug: qRestrictDeck.value,
  };
  if (!body.questionText || !body.optionA || !body.optionB || !body.optionC || !body.optionD) {
    qFormError.textContent = 'Soru metni ve 4 şıkkın hepsi zorunludur.';
    qFormError.style.display = '';
    return;
  }
  if (body.correctOption === 'E' && !body.optionE) {
    qFormError.textContent = 'Doğru şık E seçildi ama E şıkkı boş.';
    qFormError.style.display = '';
    return;
  }

  qSaveBtn.disabled = true;
  try {
    if (editingQuestionId) {
      await sendJSON(`/api/admin/questions/${editingQuestionId}`, 'PUT', body);
    } else {
      await sendJSON('/api/admin/questions', 'POST', body);
    }
    resetQuestionForm();
    await loadAllQuestions();
  } catch (err) {
    qFormError.textContent = err.message || 'Soru kaydedilemedi.';
    qFormError.style.display = '';
  } finally {
    qSaveBtn.disabled = false;
  }
});

let allQuestionsCache = [];

async function loadAllQuestions() {
  try {
    allQuestionsCache = await getJSON('/api/admin/questions');
    questionsLoaded = true;
    renderQuestionsList();
  } catch (err) {
    // sessizce geç
  }
}

function renderQuestionsList() {
  questionsListEl.innerHTML = '';
  if (allQuestionsCache.length === 0) {
    questionsEmptyHintEl.style.display = '';
    return;
  }
  questionsEmptyHintEl.style.display = 'none';

  allQuestionsCache.forEach((q) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    const restrictLabel = q.restrictDeckSlug
      ? ` · Sadece: ${deckTitleBySlug[q.restrictDeckSlug] || q.restrictDeckSlug}`
      : '';
    item.innerHTML = `
      <div class="question-item-top">
        <div>
          <div class="question-item-meta">${q.source || 'Kaynak belirtilmemiş'}${restrictLabel}</div>
          <div class="question-item-text">${q.questionText}</div>
        </div>
        <div class="question-item-actions">
          <button class="q-edit-btn" type="button">Düzenle</button>
          <button class="q-delete-btn" type="button">Sil</button>
        </div>
      </div>
    `;
    item.querySelector('.q-edit-btn').addEventListener('click', () => editQuestion(q));
    item.querySelector('.q-delete-btn').addEventListener('click', () => deleteQuestion(q));
    questionsListEl.appendChild(item);
  });
}

function editQuestion(q) {
  editingQuestionId = q.id;
  qFormTitle.textContent = 'Soruyu Düzenle';
  qSaveBtn.textContent = 'Güncelle';
  qCancelEditBtn.style.display = '';

  qQuestionText.value = q.questionText;
  qOptionA.value = q.optionA;
  qOptionB.value = q.optionB;
  qOptionC.value = q.optionC;
  qOptionD.value = q.optionD;
  qOptionE.value = q.optionE || '';
  qCorrectOption.value = q.correctOption;
  qExplanation.value = q.explanation || '';
  qSource.value = q.source || '';
  qRestrictDeck.value = q.restrictDeckSlug || '';
  qFormError.style.display = 'none';

  document.querySelector('.question-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteQuestion(q) {
  if (!confirm('Bu soruyu silmek istediğine emin misin?')) return;
  try {
    await sendJSON(`/api/admin/questions/${q.id}`, 'DELETE');
    if (editingQuestionId === q.id) resetQuestionForm();
    await loadAllQuestions();
  } catch (err) {
    alert(err.message || 'Soru silinemedi.');
  }
}

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    if (!me.isOwner) {
      showOnly(noAccessEl);
      return;
    }
    showOnly(adminContentEl);
    await loadClassFilterOptions();
    await loadStudents();
    // Badge için bekleyen talep sayısını arka planda çek
    loadWordRequests();
  } catch (err) {
    // getJSON zaten yönlendirdi/no-access gösterdi
  }
})();
