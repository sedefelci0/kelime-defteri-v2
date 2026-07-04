const PANELS = {
  loading:   document.getElementById('loading-panel'),
  already:   document.getElementById('already-panel'),
  challenge: document.getElementById('challenge-panel'),
  timeout:   document.getElementById('timeout-panel'),
  result:    document.getElementById('result-panel'),
};

function showPanel(name) {
  Object.entries(PANELS).forEach(([k, el]) => { el.style.display = k === name ? '' : 'none'; });
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error('Istek basarisiz');
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
  if (!res.ok) throw new Error(data.error || 'Bir hata olustu.');
  return data;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(secs) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}d ${secs % 60}s`;
}

function renderLeaderboard(rows, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!rows || !rows.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center">Henüz katılımcı yok.</p>'; return; }
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = `
    <h3 class="ch-lb-title">Bugünkü Sıralama</h3>
    <div class="ch-lb-list">
      ${rows.map((r, i) => `
        <div class="ch-lb-row ${i < 3 ? 'ch-lb-row--medal' : ''}">
          <span class="ch-lb-rank">${i < 3 ? medals[i] : r.rank + '.'}</span>
          <span class="ch-lb-name">${r.displayName}</span>
          <span class="ch-lb-class">${r.className}</span>
          <span class="ch-lb-score">${r.score}/5</span>
          <span class="ch-lb-dur">${formatDuration(r.durationSeconds)}</span>
        </div>
      `).join('')}
    </div>
  `;
  el.style.display = '';
}

let challengeData = null;
let currentIdx = 0;
let correctCount = 0;
let startTime = 0;
let timerInterval = null;
let remainingSeconds = 180;
let answered = false;

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startTimer() {
  const timerEl = document.getElementById('ch-timer');
  startTime = Date.now();
  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    timerEl.textContent = formatTime(remainingSeconds);
    timerEl.classList.toggle('ch-timer--warning', remainingSeconds <= 30);
    if (remainingSeconds <= 0) {
      stopTimer();
      handleTimeout();
    }
  }, 1000);
}

async function handleTimeout() {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const result = await submitResult(correctCount, elapsed).catch(() => null);
  document.getElementById('timeout-score-text').textContent = `${correctCount}/5 doğru`;
  showPanel('timeout');
  const board = await getJSON('/api/challenge/leaderboard').catch(() => []);
  renderLeaderboard(board, 'leaderboard-timeout');
}

async function submitResult(score, duration) {
  return postJSON('/api/challenge/submit', {
    challengeId: challengeData.challengeId,
    score,
    durationSeconds: Math.min(duration, 180),
  });
}

function renderQuestion() {
  const q = challengeData.questions[currentIdx];
  const totalQ = challengeData.questions.length;

  document.getElementById('ch-progress-text').textContent = `Soru ${currentIdx + 1} / ${totalQ}`;
  document.getElementById('ch-progress-fill').style.width = `${(currentIdx / totalQ) * 100}%`;
  document.getElementById('ch-question-text').textContent = q.questionText;
  document.getElementById('ch-explanation').style.display = 'none';
  document.getElementById('ch-explanation').textContent = '';
  document.getElementById('ch-next-btn').style.display = 'none';
  answered = false;

  const optionsEl = document.getElementById('ch-options');
  const opts = [
    { key: 'A', text: q.optionA },
    { key: 'B', text: q.optionB },
    { key: 'C', text: q.optionC },
    { key: 'D', text: q.optionD },
    q.optionE ? { key: 'E', text: q.optionE } : null,
  ].filter(Boolean);

  optionsEl.innerHTML = '';
  opts.forEach(({ key, text }) => {
    const btn = document.createElement('button');
    btn.className = 'ch-option-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="ch-opt-key">${key}</span><span class="ch-opt-text">${text}</span>`;
    btn.addEventListener('click', () => handleAnswer(key));
    optionsEl.appendChild(btn);
  });
}

function handleAnswer(selected) {
  if (answered) return;
  answered = true;

  const q = challengeData.questions[currentIdx];
  const isCorrect = selected === q.correctOption;
  if (isCorrect) correctCount++;

  const optBtns = document.querySelectorAll('.ch-option-btn');
  optBtns.forEach((btn) => {
    const key = btn.querySelector('.ch-opt-key').textContent;
    btn.disabled = true;
    if (key === q.correctOption) btn.classList.add('ch-option--correct');
    else if (key === selected && !isCorrect) btn.classList.add('ch-option--wrong');
  });

  if (q.explanation) {
    const expEl = document.getElementById('ch-explanation');
    expEl.textContent = q.explanation;
    expEl.style.display = '';
  }

  document.getElementById('ch-next-btn').style.display = '';
}

document.getElementById('ch-next-btn').addEventListener('click', async () => {
  currentIdx++;
  if (currentIdx < challengeData.questions.length) {
    renderQuestion();
    return;
  }

  // Tüm sorular bitti
  stopTimer();
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const submitRes = await submitResult(correctCount, elapsed).catch(() => ({ rank: '?' }));

  // Sonuç paneli
  const icons = ['😕', '😐', '🙂', '😊', '🤩', '🏆'];
  document.getElementById('result-icon').textContent = icons[correctCount] || '🎉';
  document.getElementById('result-title').textContent = correctCount === 5 ? 'Mükemmel!' : correctCount >= 3 ? 'Aferin!' : 'İyi çalışma!';
  document.getElementById('result-score').textContent = `${correctCount} / 5 doğru`;
  document.getElementById('result-rank-text').textContent = `Sıralaman: ${submitRes.rank}. sıra`;

  document.getElementById('ch-progress-fill').style.width = '100%';
  document.getElementById('ch-progress-text').textContent = 'Tamamlandı!';

  showPanel('result');
  const board = await getJSON('/api/challenge/leaderboard').catch(() => []);
  renderLeaderboard(board, 'leaderboard-result');
});

document.getElementById('view-board-btn').addEventListener('click', async () => {
  const board = await getJSON('/api/challenge/leaderboard').catch(() => []);
  renderLeaderboard(board, 'leaderboard-after');
  document.getElementById('view-board-btn').style.display = 'none';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

(async function init() {
  showPanel('loading');
  try {
    const data = await getJSON('/api/challenge/today');

    if (data.alreadyPlayed) {
      const r = data.result;
      document.getElementById('already-score-text').textContent =
        `${r.score}/5 doğru · ${formatDuration(r.durationSeconds)}`;
      showPanel('already');
      return;
    }

    challengeData = data;
    document.getElementById('ch-class-info').textContent =
      `${data.classGrade}. Sınıf · ${data.date} · 5 soru · 3 dakika`;
    document.getElementById('ch-timer').textContent = formatTime(data.totalSeconds || 180);
    remainingSeconds = data.totalSeconds || 180;

    renderQuestion();
    showPanel('challenge');
    startTimer();
  } catch (err) {
    PANELS.loading.querySelector('.loading-state').textContent =
      err.message === '401' ? '' : 'Bu özellik sadece 5-8. sınıf öğrencilerine açık.';
  }
})();
