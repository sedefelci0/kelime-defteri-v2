let notes = [];
let currentNoteId = null;

// Notlarda renk alanı yok (görsel amaçlı, DB'ye eklenmedi) — kartlara
// sırasına göre döngüsel olarak uygulamanın diğer yerlerinde de kullanılan
// gradyan paletinden renk atanır. Not sırası updated_at DESC ile sabit
// olduğu için bir not her açılışta hep aynı rengi alır.
const NOTE_GRADIENTS = [
  ['#06B6D4', '#3B82F6'],
  ['#6366F1', '#8B5CF6'],
  ['#F59E0B', '#FB923C'],
  ['#7C3AED', '#C026D3'],
];

const listViewEl = document.getElementById('list-view');
const editorViewEl = document.getElementById('editor-view');
const loadingEl = document.getElementById('loading');
const emptyNotesEl = document.getElementById('empty-notes');
const notesListEl = document.getElementById('notes-list');

const noteTitleEl = document.getElementById('note-title');
const noteContentEl = document.getElementById('note-content');
const saveStatusEl = document.getElementById('save-status');
const deleteNoteBtn = document.getElementById('delete-note-btn');

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Giriş gerekli');
  }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

async function sendJSON(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Kart üzerinde "2 gün önce güncellendi" gibi göreceli tarih gösterir;
// bir haftadan eskiyse okunabilirlik için mutlak tarihe döner.
function formatRelativeUpdated(iso) {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays <= 0) return 'Bugün güncellendi';
  if (diffDays === 1) return 'Dün güncellendi';
  if (diffDays < 7) return `${diffDays} gün önce güncellendi`;
  return `${formatDate(iso)} güncellendi`;
}

function showList() {
  editorViewEl.style.display = 'none';
  listViewEl.style.display = '';
  loadNotes();
}

function showEditor(note) {
  listViewEl.style.display = 'none';
  editorViewEl.style.display = '';
  saveStatusEl.textContent = '';
  if (note) {
    currentNoteId = note.id;
    noteTitleEl.value = note.title || '';
    noteContentEl.value = note.content || '';
    deleteNoteBtn.style.display = '';
  } else {
    currentNoteId = null;
    noteTitleEl.value = '';
    noteContentEl.value = '';
    deleteNoteBtn.style.display = 'none';
  }
  noteContentEl.focus();
}

function renderNotesList() {
  notesListEl.innerHTML = '';
  if (notes.length === 0) {
    emptyNotesEl.style.display = '';
    return;
  }
  emptyNotesEl.style.display = 'none';

  notes.forEach((note, i) => {
    const [from, to] = NOTE_GRADIENTS[i % NOTE_GRADIENTS.length];

    // Not: kart bir <button> DEĞİL <div> olmalı — içine düzenle/sil için ayrı
    // <button>'lar koyuyoruz ve HTML'de bir button başka bir button'ı
    // barındıramaz (tarayıcı iç içe görünce dıştakini erken kapatır, kart
    // içeriği kartın dışına taşar). Tıklanabilirlik click handler'ıyla sağlanıyor.
    const card = document.createElement('div');
    card.className = 'note-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.style.background = `linear-gradient(135deg, ${from}, ${to})`;

    const title = note.title && note.title.trim() ? note.title : '(Başlıksız not)';
    const snippet = (note.content || '').replace(/\n/g, ' ').slice(0, 90);
    card.innerHTML = `
      <div class="note-card-top">
        <div class="note-card-icon">📝</div>
        <div class="note-card-actions">
          <button type="button" class="note-icon-btn note-icon-btn--edit" title="Düzenle">✏️</button>
          <button type="button" class="note-icon-btn note-icon-btn--delete" title="Sil">🗑️</button>
        </div>
      </div>
      <div class="note-card-title">${title}</div>
      <div class="note-card-snippet">${snippet}</div>
      <div class="note-card-date">${formatRelativeUpdated(note.updated_at)}</div>
    `;
    card.addEventListener('click', () => showEditor(note));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showEditor(note); }
    });
    card.querySelector('.note-icon-btn--edit').addEventListener('click', (e) => {
      e.stopPropagation();
      showEditor(note);
    });
    card.querySelector('.note-icon-btn--delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Bu notu silmek istediğine emin misin?')) return;
      try {
        await sendJSON(`/api/notes/${note.id}`, 'DELETE');
        loadNotes();
      } catch (err) {
        alert('Not silinemedi, tekrar dene.');
      }
    });
    notesListEl.appendChild(card);
  });
}

async function loadNotes() {
  loadingEl.style.display = '';
  notesListEl.style.display = 'none';
  try {
    notes = await getJSON('/api/notes');
    loadingEl.style.display = 'none';
    notesListEl.style.display = '';
    renderNotesList();
  } catch (err) {
    loadingEl.textContent = 'Notlar yüklenemedi.';
  }
}

document.getElementById('add-note-btn').addEventListener('click', () => showEditor(null));
document.getElementById('empty-add-note-btn').addEventListener('click', () => showEditor(null));
document.getElementById('editor-back-btn').addEventListener('click', showList);

document.getElementById('save-note-btn').addEventListener('click', async () => {
  const title = noteTitleEl.value;
  const content = noteContentEl.value;
  saveStatusEl.textContent = 'Kaydediliyor…';
  try {
    if (currentNoteId) {
      await sendJSON(`/api/notes/${currentNoteId}`, 'PUT', { title, content });
    } else {
      const created = await sendJSON('/api/notes', 'POST', { title, content });
      currentNoteId = created.id;
      deleteNoteBtn.style.display = '';
    }
    saveStatusEl.textContent = 'Kaydedildi ✓';
  } catch (err) {
    saveStatusEl.textContent = 'Kaydedilemedi, tekrar dene.';
  }
});

deleteNoteBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Bu notu silmek istediğine emin misin?')) return;
  try {
    await sendJSON(`/api/notes/${currentNoteId}`, 'DELETE');
    showList();
  } catch (err) {
    alert('Not silinemedi, tekrar dene.');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    await loadNotes();
  } catch (err) {
    // getJSON zaten 401'de yönlendiriyor
  }
})();
