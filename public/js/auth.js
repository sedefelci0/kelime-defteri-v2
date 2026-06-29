const errorBanner = document.getElementById('error-banner');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const hintFromLogin = document.getElementById('hint-from-login');
const hintFromSignup = document.getElementById('hint-from-signup');

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.add('visible');
}
function clearError() {
  errorBanner.classList.remove('visible');
  errorBanner.textContent = '';
}

function showLogin() {
  clearError();
  loginForm.style.display = '';
  signupForm.style.display = 'none';
  tabLogin.classList.add('active');
  tabSignup.classList.remove('active');
  hintFromLogin.style.display = '';
  hintFromSignup.style.display = 'none';
}
function showSignup() {
  clearError();
  loginForm.style.display = 'none';
  signupForm.style.display = '';
  tabLogin.classList.remove('active');
  tabSignup.classList.add('active');
  hintFromLogin.style.display = 'none';
  hintFromSignup.style.display = '';
}

tabLogin.addEventListener('click', showLogin);
tabSignup.addEventListener('click', showSignup);
document.getElementById('goto-signup').addEventListener('click', showSignup);
document.getElementById('goto-login').addEventListener('click', showLogin);

// Sınıf dropdown'unu doldur (5,6,7,8 sınıf x A-F şube)
const CLASS_LIST = [];
for (const grade of [5, 6, 7, 8]) {
  for (const section of ['A', 'B', 'C', 'D', 'E', 'F']) {
    CLASS_LIST.push(`${grade}-${section}`);
  }
}
const classSelect = document.getElementById('signup-class');
CLASS_LIST.forEach((c) => {
  const opt = document.createElement('option');
  opt.value = c;
  opt.textContent = c;
  classSelect.appendChild(opt);
});

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await postJSON('/api/auth/login', { email, password });
    window.location.href = '/decks.html';
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const displayName = document.getElementById('signup-name').value.trim();
  const className = document.getElementById('signup-class').value;
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const submitBtn = signupForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await postJSON('/api/auth/signup', { displayName, className, email, password });
    window.location.href = '/decks.html';
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// Zaten giriş yapılmışsa direkt deste seçim ekranına yönlendir
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) window.location.href = '/decks.html';
  } catch (_) {}
})();
