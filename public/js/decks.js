const DECK_THEMES = {
  'yokdil':             { theme: 'purple', icon: '🏆', badge: 'Popüler' },
  'benim-kelimelerim':  { theme: 'green',  icon: '⭐' },
  '5-sinif':            { theme: 'orange', icon: '📗' },
  '8-sinif':            { theme: 'yellow', icon: '📘' },
};

const loadingEl       = document.getElementById('loading');
const deckListViewEl  = document.getElementById('deck-list-view');
const unitListViewEl  = document.getElementById('unit-list-view');
const deckGridEl      = document.getElementById('deck-grid');
const unitButtonsEl   = document.getElementById('unit-buttons');
const unitDeckTitleEl = document.getElementById('unit-deck-title');
const unitDeckIconEl  = document.getElementById('unit-deck-icon');

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function showView(view) {
  loadingEl.style.display      = view === 'loading' ? '' : 'none';
  deckListViewEl.style.display = view === 'decks'   ? '' : 'none';
  unitListViewEl.style.display = view === 'units'   ? '' : 'none';
}

function goToStudy(deckSlug, unit) {
  const params = new URLSearchParams({ deck: deckSlug });
  if (unit !== undefined && unit !== null) params.set('unit', unit);
  window.location.href = `/study.html?${params.toString()}`;
}

async function openDeck(deck) {
  if (deck.unitCount > 0) {
    const t = DECK_THEMES[deck.slug] || { theme: 'purple', icon: '📚' };
    unitDeckTitleEl.textContent = deck.title;
    unitDeckIconEl.textContent  = t.icon;
    unitDeckIconEl.className    = `unit-deck-icon unit-deck-icon--${t.theme}`;

    showView('loading');
    const units = await getJSON(`/api/decks/${deck.slug}/units`);
    unitButtonsEl.innerHTML = '';
    units.forEach((u) => {
      const btn = document.createElement('button');
      btn.className   = 'unit-btn';
      btn.textContent = u.name || `Ünite ${u.unit}`;
      btn.addEventListener('click', () => goToStudy(deck.slug, u.unit));
      unitButtonsEl.appendChild(btn);
    });
    showView('units');
  } else {
    goToStudy(deck.slug);
  }
}

async function loadDecks() {
  showView('loading');
  const decks = await getJSON('/api/decks');
  deckGridEl.innerHTML = '';

  decks.forEach((deck) => {
    const t = DECK_THEMES[deck.slug] || { theme: 'purple', icon: '📚' };

    const card = document.createElement('button');
    card.className = `deck-card deck-card--${t.theme}`;
    card.type = 'button';

    const metaText = deck.wordCount
      ? `${deck.wordCount.toLocaleString('tr-TR')} kelime${deck.unitCount > 0 ? ` · ${deck.unitCount} ünite` : ''}`
      : '';

    card.innerHTML = `
      <div class="deck-card-top">
        <div class="deck-icon-circle">${t.icon}</div>
        ${t.badge ? `<span class="deck-badge">${t.badge}</span>` : ''}
      </div>
      <div class="deck-title">${deck.title}</div>
      ${deck.description ? `<div class="deck-desc">${deck.description}</div>` : ''}
      ${metaText ? `<div class="deck-meta">${metaText}</div>` : ''}
    `;
    card.addEventListener('click', () => openDeck(deck));
    deckGridEl.appendChild(card);
  });

  showView('decks');
}

document.getElementById('back-to-decks').addEventListener('click', loadDecks);

document.getElementById('notes-btn').addEventListener('click', () => {
  window.location.href = '/notes.html';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

document.getElementById('profil-btn').addEventListener('click', () => {
  window.location.href = '/profil.html';
});

document.getElementById('admin-panel-btn').addEventListener('click', () => {
  window.location.href = '/admin.html';
});

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    const userBtn = document.getElementById('user-name-btn');
    userBtn.textContent = me.displayName;
    userBtn.addEventListener('click', () => { window.location.href = '/profil.html'; });

    if (me.isOwner) {
      document.getElementById('admin-panel-btn').style.display = '';
    }
    await loadDecks();
  } catch (err) {
    // getJSON 401'de zaten yönlendiriyor
  }
})();
