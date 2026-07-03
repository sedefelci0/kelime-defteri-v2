let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) {}

let transporter = null;

function getTransporter() {
  if (!nodemailer || !process.env.SMTP_USER) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function sendVerificationEmail(email, displayName, token) {
  const t = getTransporter();
  if (!t) return false;
  const url = `${process.env.APP_URL || ''}/verify-email.html?token=${token}`;
  await t.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: email,
    subject: 'Kelime Defteri - E-posta dogrulama',
    html: `<p>Merhaba ${displayName},</p>
<p>Hesabini dogrulamak icin asagidaki baglantiya tikla:</p>
<p><a href="${url}">${url}</a></p>
<p>Bu baglanti 1 saat gecerlidir.</p>
<p>Kelime Defteri</p>`,
  });
  return true;
}

async function sendPasswordResetEmail(email, displayName, token) {
  const t = getTransporter();
  if (!t) return false;
  const url = `${process.env.APP_URL || ''}/reset-password.html?token=${token}`;
  await t.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: email,
    subject: 'Kelime Defteri - Sifre sifirlama',
    html: `<p>Merhaba ${displayName},</p>
<p>Sifreni sifirlamak icin asagidaki baglantiya tikla:</p>
<p><a href="${url}">${url}</a></p>
<p>Bu baglanti 1 saat gecerlidir. Eger bu talebi sen yapmadiysan, e-postay&#x131; gormezden gel.</p>
<p>Kelime Defteri</p>`,
  });
  return true;
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
