const PANELS = {
  loading:  document.getElementById('loading-panel'),
  error:    document.getElementById('error-panel'),
  entry:    document.getElementById('entry-panel'),
  question: document.getElementById('question-panel'),
  waiting:  document.getElementById('waiting-panel'),
  result:   document.getElementById('result-panel'),
};

function showPanel(name) {
  Object.entries(PANELS).forEach(([k, el]) => { el.style.display = k === name ? '' : 'none'; });
}

function showError(message) {
  document.getElementById('error-text').textContent = message;
  showPanel('error');
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız.');
  return data;
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'İstek başarısız.');
    err.data = data;
    throw err;
  }
  return data;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatDuration(secs) {
  if (secs === null || secs === undefined) return '—';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}d ${secs % 60}s`;
}

const params = new URLSearchParams(window.location.search);
const deckSlug = params.get('deck');
const unit = params.get('unit');
const isDuel = params.get('mode') === 'duel';

let quiz = null; // { attemptId, questions, answers, deadlineAt, windowEndsAt }
let currentIdx = 0;
let timerInterval = null;

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startTimer(deadlineAt) {
  stopTimer();
  const timerEl = document.getElementById('qz-timer');
  const deadline = new Date(deadlineAt).getTime();
  const tick = () => {
    const remaining = (deadline - Date.now()) / 1000;
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle('ch-timer--warning', remaining <= 30);
    if (remaining <= 0) {
      stopTimer();
      document.querySelectorAll('#qz-options .ch-option-btn').forEach((b) => { b.disabled = true; });
      // Süre sunucuda da kontrol ediliyor; küçük bir saat farkı ihtimaline
      // karşı sunucu henüz süreyi kapatmamışsa kısa aralıklarla tekrar dener.
      pollAttempt(0);
    }
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

function renderQuestion() {
  const q = quiz.questions[currentIdx];
  const total = quiz.questions.length;

  document.getElementById('qz-progress-text').textContent = `Soru ${currentIdx + 1} / ${total}`;
  document.getElementById('qz-progress-fill').style.width = `${(currentIdx / total) * 100}%`;
  document.getElementById('qz-question-text').textContent = q.prompt;

  const optionsEl = document.getElementById('qz-options');
  optionsEl.innerHTML = '';
  q.options.forEach((text, idx) => {
    const btn = document.createElement('button');
    btn.className = 'ch-option-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="ch-opt-key">${String.fromCharCode(65 + idx)}</span><span class="ch-opt-text">${text}</span>`;
    btn.addEventListener('click', () => handleAnswer(idx));
    optionsEl.appendChild(btn);
  });
}

let answering = false;

async function handleAnswer(selectedIndex) {
  if (answering) return;
  answering = true;

  const optBtns = document.querySelectorAll('#qz-options .ch-option-btn');
  optBtns.forEach((b) => { b.disabled = true; });

  try {
    const res = await postJSON(`/api/quiz/attempts/${quiz.attemptId}/answer`, {
      questionIndex: currentIdx,
      selectedIndex,
    });

    optBtns.forEach((b, idx) => {
      if (idx === res.correctIndex) b.classList.add('ch-option--correct');
      else if (idx === selectedIndex) b.classList.add('ch-option--wrong');
    });

    quiz.deadlineAt = res.deadlineAt;
    quiz.windowEndsAt = res.windowEndsAt;

    setTimeout(() => {
      answering = false;
      if (res.status !== 'in_progress') {
        stopTimer();
        handleFinished(res);
        return;
      }
      currentIdx++;
      if (currentIdx < quiz.questions.length) {
        renderQuestion();
      }
    }, 700);
  } catch (err) {
    answering = false;
    if (err.data && err.data.status && err.data.status !== 'in_progress') {
      stopTimer();
      handleFinished(err.data);
      return;
    }
    alert(err.message || 'Cevap kaydedilemedi.');
    optBtns.forEach((b) => { b.disabled = false; });
  }
}

function ownResultText(res) {
  return `${res.correctCount} / ${quiz.questions.length} doğru · ${formatDuration(res.durationSeconds)}`;
}

function handleFinished(res) {
  document.getElementById('qz-progress-fill').style.width = '100%';

  if (res.match && res.match.status === 'resolved') {
    showResult(res);
    return;
  }

  document.getElementById('waiting-score-text').textContent = ownResultText(res);
  showPanel('waiting');
  pollForOpponent(res.windowEndsAt);
}

function showResult(res) {
  const icons = { win: '🏆', lose: '😕', tie: '🤝' };
  document.getElementById('result-icon').textContent = icons[res.match.result] || '🎉';
  document.getElementById('result-title').textContent =
    res.match.result === 'win' ? 'Kazandın!' : res.match.result === 'lose' ? 'Kaybettin' : 'Berabere!';

  const selfIsWinner = res.match.result === 'win';
  const oppIsWinner = res.match.result === 'lose';
  document.getElementById('qz-vs-card').innerHTML = `
    <div class="qz-vs-side ${selfIsWinner ? 'qz-vs-side--winner' : ''}">
      <div class="qz-vs-name">Sen</div>
      <div class="qz-vs-score">${res.correctCount}/${quiz.questions.length}</div>
      <div class="qz-vs-dur">${formatDuration(res.durationSeconds)}</div>
    </div>
    <div class="qz-vs-sep">VS</div>
    <div class="qz-vs-side ${oppIsWinner ? 'qz-vs-side--winner' : ''}">
      <div class="qz-vs-name">${res.match.opponent.displayName}</div>
      <div class="qz-vs-score">${res.match.opponent.correctCount}/${quiz.questions.length}</div>
      <div class="qz-vs-dur">${formatDuration(res.match.opponent.durationSeconds)}</div>
    </div>
  `;
  showPanel('result');
}

let pollTimeout = null;

async function pollForOpponent(windowEndsAt) {
  if (pollTimeout) clearTimeout(pollTimeout);
  try {
    const res = await getJSON(`/api/quiz/attempts/${quiz.attemptId}`);
    if (res.match && res.match.status === 'resolved') {
      showResult(res);
      return;
    }
    if (windowEndsAt && Date.now() > new Date(windowEndsAt).getTime() + 2 * 60 * 1000) {
      document.getElementById('waiting-panel').querySelector('.ch-sub:last-child').textContent =
        'Bu pencerede eşleşecek başka öğrenci bulunamadı.';
      return;
    }
    pollTimeout = setTimeout(() => pollForOpponent(windowEndsAt), 4000);
  } catch (err) {
    pollTimeout = setTimeout(() => pollForOpponent(windowEndsAt), 6000);
  }
}

async function pollAttempt(retryCount) {
  try {
    const res = await getJSON(`/api/quiz/attempts/${quiz.attemptId}`);
    if (res.status !== 'in_progress') {
      handleFinished(res);
      return;
    }
    // Saat farkı yüzünden sunucu süreyi henüz kapatmamış olabilir — birkaç kez daha dene.
    if (retryCount < 5) setTimeout(() => pollAttempt(retryCount + 1), 1000);
  } catch (err) {
    if (retryCount < 5) setTimeout(() => pollAttempt(retryCount + 1), 1500);
  }
}

function beginQuizFromAttempt(data) {
  quiz = {
    attemptId: data.attemptId,
    questions: data.questions,
    deadlineAt: data.deadlineAt,
    windowEndsAt: data.windowEndsAt,
  };

  document.getElementById('qz-info').textContent = `${deckSlug} · Ünite ${unit}`;

  const roomLineEl = document.getElementById('qz-room-code-line');
  if (data.match && data.match.roomCode) {
    roomLineEl.textContent = `Oda kodu: ${data.match.roomCode} — bu kodu arkadaşına ver`;
    roomLineEl.style.display = '';
  } else {
    roomLineEl.style.display = 'none';
  }

  if (data.status !== 'in_progress') {
    handleFinished(data);
    return;
  }

  // answers dizisi henüz hiç cevap verilmediyse boştur ([]), ilk cevaptan
  // sonra soru sayısı kadar uzayıp boş kalanlar null olur — bu yüzden "ilk
  // geçersiz/eksik cevap" yerine "ilk null VEYA dizinin bittiği yer" aranır,
  // yoksa boş bir dizide her zaman -1 dönüp yanlışlıkla son soruya atlardı.
  const answers = Array.isArray(data.answers) ? data.answers : [];
  let firstUnanswered = answers.findIndex((a) => !Number.isInteger(a));
  if (firstUnanswered === -1) firstUnanswered = answers.length;
  currentIdx = Math.min(firstUnanswered, quiz.questions.length - 1);

  showPanel('question');
  renderQuestion();
  startTimer(quiz.deadlineAt);
}

async function startAttempt(windowId) {
  try {
    const data = await postJSON('/api/quiz/attempts', { windowId });
    beginQuizFromAttempt(data);
  } catch (err) {
    showError(err.message || 'Test başlatılamadı.');
  }
}

function showEntryError(message) {
  const el = document.getElementById('entry-error');
  el.textContent = message;
  el.style.display = '';
}

async function openRoom(windowId) {
  try {
    const data = await postJSON('/api/quiz/rooms', { windowId });
    beginQuizFromAttempt(data);
  } catch (err) {
    showEntryError(err.message || 'Oda açılamadı.');
  }
}

// Düello: öğretmen penceresi yok, POST /api/quiz/duels aynı sınıf+deste+ünite
// için "yuvarlanan" bir pencere bulur/oluşturur ve doğrudan denemeyi/odayı
// başlatır (bkz. routes/quiz.js resolveDuelWindow).
async function startDuelAuto() {
  try {
    const data = await postJSON('/api/quiz/duels', { deckSlug, unit: Number(unit), mode: 'auto' });
    beginQuizFromAttempt(data);
  } catch (err) {
    showEntryError(err.message || 'Düello başlatılamadı.');
  }
}

async function openDuelRoom() {
  try {
    const data = await postJSON('/api/quiz/duels', { deckSlug, unit: Number(unit), mode: 'room' });
    beginQuizFromAttempt(data);
  } catch (err) {
    showEntryError(err.message || 'Oda açılamadı.');
  }
}

async function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!code) { showEntryError('Önce arkadaşından aldığın oda kodunu gir.'); return; }
  try {
    const data = await postJSON(`/api/quiz/rooms/${encodeURIComponent(code)}/join`, {});
    beginQuizFromAttempt(data);
  } catch (err) {
    showEntryError(err.message || 'Odaya katılamadın.');
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

(async function init() {
  showPanel('loading');
  if (!deckSlug || !unit) {
    showError('Geçersiz bağlantı.');
    return;
  }

  if (isDuel) {
    document.getElementById('start-btn').textContent = 'Rakip Bul (Otomatik)';
    document.getElementById('entry-info').textContent =
      `${deckSlug} · Ünite ${unit} — sınıf arkadaşınla düello! Otomatik rakip bul, oda aç ya da bir kodla katıl.`;
    document.getElementById('start-btn').addEventListener('click', () => startDuelAuto(), { once: true });
    document.getElementById('open-room-btn').addEventListener('click', () => openDuelRoom(), { once: true });
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    showPanel('entry');
    return;
  }

  try {
    const info = await getJSON(`/api/quiz/active?deckSlug=${encodeURIComponent(deckSlug)}&unit=${encodeURIComponent(unit)}`);
    if (!info.active) {
      showError('Bu ünite için şu an aktif bir yarışma testi bulunmuyor.');
      return;
    }
    if (info.alreadyAttempted) {
      await startAttempt(info.windowId);
      return;
    }
    document.getElementById('entry-info').textContent =
      `${deckSlug} · Ünite ${unit} — teste başladığında süren başlar, hazır olduğunda gir.`;
    document.getElementById('start-btn').addEventListener('click', () => startAttempt(info.windowId), { once: true });
    document.getElementById('open-room-btn').addEventListener('click', () => openRoom(info.windowId), { once: true });
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    showPanel('entry');
  } catch (err) {
    if (err.message !== '401') showError(err.message || 'Bir hata oluştu.');
  }
})();
