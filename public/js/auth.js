const errorBanner = document.getElementById('error-banner');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const forgotForm = document.getElementById('forgot-form');
const forgotSentPanel = document.getElementById('forgot-sent-panel');
const verifyPendingPanel = document.getElementById('verify-pending-panel');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const hintFromLogin = document.getElementById('hint-from-login');
const hintFromSignup = document.getElementById('hint-from-signup');

const ALL_PANELS = [loginForm, signupForm, forgotForm, forgotSentPanel, verifyPendingPanel];

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.add('visible');
}
function clearError() {
  errorBanner.classList.remove('visible');
  errorBanner.textContent = '';
}

function hideAll() {
  ALL_PANELS.forEach((p) => { if (p) p.style.display = 'none'; });
  hintFromLogin.style.display = 'none';
  hintFromSignup.style.display = 'none';
  tabLogin.classList.remove('active');
  tabSignup.classList.remove('active');
  clearError();
}

function showLogin() {
  hideAll();
  loginForm.style.display = '';
  tabLogin.classList.add('active');
  hintFromLogin.style.display = '';
}
function showSignup() {
  hideAll();
  signupForm.style.display = '';
  tabSignup.classList.add('active');
  hintFromSignup.style.display = '';
}
function showForgot() {
  hideAll();
  forgotForm.style.display = '';
}
function showForgotSent() {
  hideAll();
  forgotSentPanel.style.display = '';
}
function showVerifyPending(email) {
  hideAll();
  verifyPendingPanel.style.display = '';
  const display = document.getElementById('verify-email-display');
  if (display) display.textContent = email;
  document.getElementById('resend-verify-btn').dataset.email = email;
  document.getElementById('resend-msg').style.display = 'none';
}

tabLogin.addEventListener('click', showLogin);
tabSignup.addEventListener('click', showSignup);
document.getElementById('goto-signup').addEventListener('click', showSignup);
document.getElementById('goto-login').addEventListener('click', showLogin);
document.getElementById('goto-forgot').addEventListener('click', showForgot);
document.getElementById('back-to-login').addEventListener('click', showLogin);
document.getElementById('back-to-login-2').addEventListener('click', showLogin);
document.getElementById('back-to-login-3').addEventListener('click', showLogin);

// Sinif listesini doldur
const classSelect = document.getElementById('signup-class');
(function fillClasses() {
  const yokdil = document.createElement('option');
  yokdil.value = 'YOKDIL';
  yokdil.textContent = 'YOKDiL';
  classSelect.appendChild(yokdil);
  const grades = [5, 6, 7, 8];
  const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const g of grades) {
    for (const s of sections) {
      const opt = document.createElement('option');
      opt.value = `${g}-${s}`;
      opt.textContent = `${g}-${s}`;
      classSelect.appendChild(opt);
    }
  }
})();

// Ogrenci / Ogretmen secimi
let signupRole = 'student';
const roleStudentBtn = document.getElementById('role-student');
const roleTeacherBtn = document.getElementById('role-teacher');
const fieldClass = document.getElementById('field-class');
const fieldTeacherPassword = document.getElementById('field-teacher-password');
const teacherPwEl = document.getElementById('signup-teacher-password');

function setRole(role) {
  signupRole = role;
  const teacher = role === 'teacher';
  roleTeacherBtn.classList.toggle('active', teacher);
  roleStudentBtn.classList.toggle('active', !teacher);
  fieldClass.style.display = teacher ? 'none' : '';
  fieldTeacherPassword.style.display = teacher ? '' : 'none';
  classSelect.required = !teacher;
}
roleStudentBtn.addEventListener('click', () => setRole('student'));
roleTeacherBtn.addEventListener('click', () => setRole('teacher'));

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Bir hata olustu.'), data);
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
    const data = await postJSON('/api/auth/login', { email, password });
    window.location.href = data.isTeacher ? '/admin.html' : '/decks.html';
  } catch (err) {
    if (err.needsVerification) {
      showVerifyPending(err.email || email);
    } else {
      showError(err.message);
    }
  } finally {
    submitBtn.disabled = false;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const displayName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const submitBtn = signupForm.querySelector('button[type="submit"]');

  const body = { displayName, email, password, role: signupRole };
  if (signupRole === 'teacher') {
    body.teacherPassword = teacherPwEl.value;
  } else {
    body.className = classSelect.value;
    if (!body.className) {
      showError('Lutfen sinifini sec.');
      return;
    }
  }

  submitBtn.disabled = true;
  try {
    const data = await postJSON('/api/auth/signup', body);
    if (data.pending) {
      showVerifyPending(data.email || email);
    } else {
      window.location.href = data.isTeacher ? '/admin.html' : '/decks.html';
    }
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = document.getElementById('forgot-email').value.trim();
  const submitBtn = forgotForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await postJSON('/api/auth/forgot-password', { email });
    showForgotSent();
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('resend-verify-btn').addEventListener('click', async (e) => {
  const email = e.currentTarget.dataset.email;
  const msgEl = document.getElementById('resend-msg');
  e.currentTarget.disabled = true;
  try {
    await postJSON('/api/auth/resend-verification', { email });
    msgEl.style.display = '';
  } catch (_) {
    msgEl.style.display = '';
  } finally {
    e.currentTarget.disabled = false;
  }
});

// Zaten giris yapilmissa rol bazli yonlendir
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const me = await res.json();
      window.location.href = me.isOwner ? '/admin.html' : '/decks.html';
    }
  } catch (_) {}
})();
