const loadingEl = document.getElementById('loading');
const deckListEl = document.getElementById('deck-list');
const unitListEl = document.getElementById('unit-list');
const unitButtonsEl = document.getElementById('unit-buttons');
const unitDeckTitleEl = document.getElementById('unit-deck-title');

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Giriş gerekli');
  }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

function showOnly(el) {
  [loadingEl, deckListEl, unitListEl].forEach((e) => {
    e.style.display = e === el ? '' : 'none';
  });
}

function goToStudy(deckSlug, unit) {
  const params = new URLSearchParams({ deck: deckSlug });
  if (unit !== undefined && unit !== null) params.set('unit', unit);
  window.location.href = `/study.html?${params.toString()}`;
}

async function openDeck(deck) {
  if (deck.unitCount > 0) {
    unitDeckTitleEl.textContent = deck.title;
    const units = await getJSON(`/api/decks/${deck.slug}/units`);
    unitButtonsEl.innerHTML = '';
    units.forEach((u) => {
      const btn = document.createElement('button');
      btn.textContent = `Ünite ${u.unit}`;
      btn.addEventListener('click', () => goToStudy(deck.slug, u.unit));
      unitButtonsEl.appendChild(btn);
    });
    showOnly(unitListEl);
  } else {
    goToStudy(deck.slug);
  }
}

async function loadDecks() {
  showOnly(loadingEl);
  const decks = await getJSON('/api/decks');
  deckListEl.innerHTML = '';
  decks.forEach((deck) => {
    const card = document.createElement('button');
    card.className = 'deck-card';
    card.innerHTML = `
      <span class="deck-title">${deck.title}</span>
      <span class="deck-desc">${deck.description || ''}</span>
      <span class="deck-meta">${deck.wordCount} kelime${deck.unitCount > 0 ? ` · ${deck.unitCount} ünite` : ''}</span>
    `;
    card.addEventListener('click', () => openDeck(deck));
    deckListEl.appendChild(card);
  });
  showOnly(deckListEl);
}

document.getElementById('back-to-decks').addEventListener('click', loadDecks);

document.getElementById('notes-btn').addEventListener('click', () => {
  window.location.href = '/notes.html';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// Öğretmen girişi modalı
const ownerModal = document.getElementById('owner-modal');
const ownerError = document.getElementById('owner-error');
document.getElementById('owner-link').addEventListener('click', () => {
  ownerError.classList.remove('visible');
  document.getElementById('owner-password').value = '';
  ownerModal.style.display = 'flex';
});
document.getElementById('owner-cancel').addEventListener('click', () => {
  ownerModal.style.display = 'none';
});
document.getElementById('owner-submit').addEventListener('click', async () => {
  const password = document.getElementById('owner-password').value;
  try {
    await postJSON('/api/decks/unlock', { password });
    ownerModal.style.display = 'none';
    loadDecks();
  } catch (err) {
    ownerError.textContent = err.message;
    ownerError.classList.add('visible');
  }
});

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    await loadDecks();
  } catch (err) {
    // getJSON zaten 401'de yönlendiriyor
  }
})();
