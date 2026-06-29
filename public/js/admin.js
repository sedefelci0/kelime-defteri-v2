let students = [];

const loadingEl = document.getElementById('loading');
const noAccessEl = document.getElementById('no-access');
const tableWrapEl = document.getElementById('students-table-wrap');
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

function showOnly(el) {
  [loadingEl, noAccessEl, tableWrapEl].forEach((e) => {
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
  showOnly(loadingEl);
  try {
    const url = classFilter ? `/api/admin/students?class=${encodeURIComponent(classFilter)}` : '/api/admin/students';
    students = await getJSON(url);
    renderStudents();
    showOnly(tableWrapEl);
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

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    if (!me.isOwner) {
      showOnly(noAccessEl);
      return;
    }
    await loadClassFilterOptions();
    await loadStudents();
  } catch (err) {
    // getJSON zaten yönlendirdi/no-access gösterdi
  }
})();
