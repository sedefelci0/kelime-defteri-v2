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

// Sınıf listesini doldur (5-A ... 8-F)
const classSelect = document.getElementById('signup-class');
(function fillClasses() {
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

// Öğrenci / Öğretmen seçimi
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
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const submitBtn = signupForm.querySelector('button[type="submit"]');

  const body = { displayName, email, password, role: signupRole };
  if (signupRole === 'teacher') {
    body.teacherPassword = teacherPwEl.value;
  } else {
    body.className = classSelect.value;
    if (!body.className) {
      showError('Lütfen sınıfını seç.');
      return;
    }
  }

  submitBtn.disabled = true;
  try {
    await postJSON('/api/auth/signup', body);
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
