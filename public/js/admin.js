let students = [];

const loadingEl = document.getElementById('loading');
const noAccessEl = document.getElementById('no-access');
const adminContentEl = document.getElementById('admin-content');
const tbodyEl = document.getElementById('students-tbody');
const emptyStudentsEl = document.getElementById('empty-students');
const classFilterEl = document.getElementById('class-filter');

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
  if (students.length === 0) {
    emptyStudentsEl.style.display = '';
    return;
  }
  emptyStudentsEl.style.display = 'none';

  students.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.displayName}</td>
      <td>${s.className || '—'}</td>
      <td>${s.email}</td>
      <td>${formatDuration(s.totalStudySeconds)}</td>
      <td class="num-correct">${s.totalCorrect}</td>
      <td class="num-wrong">${s.totalWrong}</td>
      <td><button class="notes-count-btn" ${s.notes.length === 0 ? 'disabled' : ''}>${s.notes.length} not</button></td>
    `;
    tr.querySelector('.notes-count-btn').addEventListener('click', () => openNotesModal(s));
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

document.getElementById('back-to-decks-btn').addEventListener('click', () => {
  window.location.href = '/decks.html';
});
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// --- Sekmeler ---
const tabBtnStudents = document.getElementById('tab-btn-students');
const tabBtnQuestions = document.getElementById('tab-btn-questions');
const tabStudents = document.getElementById('tab-students');
const tabQuestions = document.getElementById('tab-questions');

function activateTab(name) {
  const isStudents = name === 'students';
  tabBtnStudents.classList.toggle('is-active', isStudents);
  tabBtnQuestions.classList.toggle('is-active', !isStudents);
  tabStudents.style.display = isStudents ? '' : 'none';
  tabQuestions.style.display = isStudents ? 'none' : '';
  if (!isStudents && decksCache.length === 0) {
    loadDecksForQuestionForm();
  }
}

tabBtnStudents.addEventListener('click', () => activateTab('students'));
tabBtnQuestions.addEventListener('click', () => activateTab('questions'));

// --- Soru Ekle sekmesi ---
const qDeckSelect = document.getElementById('q-deck-select');
const qUnitSelect = document.getElementById('q-unit-select');
const qWordSearch = document.getElementById('q-word-search');
const qWordResults = document.getElementById('q-word-results');
const qSelectedWordEl = document.getElementById('q-selected-word');
const qSelectedWordLabel = document.getElementById('q-selected-word-label');
const qClearWordBtn = document.getElementById('q-clear-word-btn');
const qQuestionText = document.getElementById('q-question-text');
const qOptionA = document.getElementById('q-option-a');
const qOptionB = document.getElementById('q-option-b');
const qOptionC = document.getElementById('q-option-c');
const qOptionD = document.getElementById('q-option-d');
const qCorrectOption = document.getElementById('q-correct-option');
const qExplanation = document.getElementById('q-explanation');
const qSource = document.getElementById('q-source');
const qFormError = document.getElementById('q-form-error');
const qFormTitle = document.getElementById('q-form-title');
const qSaveBtn = document.getElementById('q-save-btn');
const qCancelEditBtn = document.getElementById('q-cancel-edit-btn');
const questionsListEl = document.getElementById('questions-list');
const questionsEmptyHintEl = document.getElementById('questions-empty-hint');

let decksCache = [];
let selectedWord = null;
let editingQuestionId = null;
let wordSearchTimer = null;

async function loadDecksForQuestionForm() {
  try {
    decksCache = await getJSON('/api/decks');
    qDeckSelect.innerHTML = '<option value="">Deste seç…</option>';
    decksCache.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.slug;
      opt.textContent = d.title;
      qDeckSelect.appendChild(opt);
    });
    await loadAllQuestions();
  } catch (err) {
    // sessizce geç
  }
}

qDeckSelect.addEventListener('change', async () => {
  clearSelectedWord();
  qWordResults.innerHTML = '';
  qUnitSelect.innerHTML = '<option value="">Tüm üniteler</option>';
  qUnitSelect.style.display = 'none';

  const slug = qDeckSelect.value;
  if (!slug) {
    qWordSearch.disabled = true;
    return;
  }
  qWordSearch.disabled = false;

  try {
    const units = await getJSON(`/api/decks/${slug}/units`);
    if (units.length > 0) {
      units.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.unit;
        opt.textContent = `Ünite ${u.unit}`;
        qUnitSelect.appendChild(opt);
      });
      qUnitSelect.style.display = '';
    }
  } catch (err) {
    // sessizce geç, ünitesiz deste olabilir
  }
  searchWords();
});

qUnitSelect.addEventListener('change', () => {
  searchWords();
});

qWordSearch.addEventListener('input', () => {
  clearTimeout(wordSearchTimer);
  wordSearchTimer = setTimeout(searchWords, 250);
});

async function searchWords() {
  const slug = qDeckSelect.value;
  if (!slug) return;
  const unit = qUnitSelect.value;
  const search = qWordSearch.value.trim();

  const p = new URLSearchParams({ deck: slug });
  if (unit) p.set('unit', unit);
  if (search) p.set('search', search);

  try {
    const words = await getJSON(`/api/admin/words?${p.toString()}`);
    qWordResults.innerHTML = '';
    words.forEach((w) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'q-word-result-item';
      btn.textContent = `${w.english} — ${w.turkishMeaning}${w.unit ? ` (Ünite ${w.unit})` : ''}`;
      btn.addEventListener('click', () => selectWord(w));
      qWordResults.appendChild(btn);
    });
  } catch (err) {
    // sessizce geç
  }
}

function selectWord(word) {
  selectedWord = word;
  qSelectedWordLabel.textContent = `${word.english} — ${word.turkishMeaning}`;
  qSelectedWordEl.style.display = '';
  qWordResults.innerHTML = '';
  qWordSearch.value = '';
}

function clearSelectedWord() {
  selectedWord = null;
  qSelectedWordEl.style.display = 'none';
  qSelectedWordLabel.textContent = '';
}

qClearWordBtn.addEventListener('click', clearSelectedWord);

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
  qCorrectOption.value = 'A';
  qExplanation.value = '';
  qSource.value = '';
  qFormError.style.display = 'none';
  clearSelectedWord();
}

qCancelEditBtn.addEventListener('click', resetQuestionForm);

qSaveBtn.addEventListener('click', async () => {
  qFormError.style.display = 'none';

  if (!selectedWord) {
    qFormError.textContent = 'Önce bir kelime seçmelisin.';
    qFormError.style.display = '';
    return;
  }
  const body = {
    wordId: selectedWord.id,
    questionText: qQuestionText.value.trim(),
    optionA: qOptionA.value.trim(),
    optionB: qOptionB.value.trim(),
    optionC: qOptionC.value.trim(),
    optionD: qOptionD.value.trim(),
    correctOption: qCorrectOption.value,
    explanation: qExplanation.value.trim(),
    source: qSource.value.trim(),
  };
  if (!body.questionText || !body.optionA || !body.optionB || !body.optionC || !body.optionD) {
    qFormError.textContent = 'Soru metni ve 4 şıkkın hepsi zorunludur.';
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
    item.innerHTML = `
      <div class="question-item-top">
        <div>
          <div class="question-item-meta">${q.deckTitle}${q.wordUnit ? ` · Ünite ${q.wordUnit}` : ''} · ${q.wordEnglish}${q.source ? ` · ${q.source}` : ''}</div>
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

  selectedWord = { id: q.wordId, english: q.wordEnglish, turkishMeaning: '' };
  qSelectedWordLabel.textContent = q.wordEnglish;
  qSelectedWordEl.style.display = '';
  qWordResults.innerHTML = '';

  qQuestionText.value = q.questionText;
  qOptionA.value = q.optionA;
  qOptionB.value = q.optionB;
  qOptionC.value = q.optionC;
  qOptionD.value = q.optionD;
  qCorrectOption.value = q.correctOption;
  qExplanation.value = q.explanation || '';
  qSource.value = q.source || '';
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
  } catch (err) {
    // getJSON zaten yönlendirdi/no-access gösterdi
  }
})();
