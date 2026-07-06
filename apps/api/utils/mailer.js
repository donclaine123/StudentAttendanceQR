const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const shouldVerifyOnStartup = process.env.EMAIL_VERIFY_ON_STARTUP === 'true';

// Configure Nodemailer transporter using environment variables.
// Prefer explicit SMTP settings when provided, otherwise fall back to Gmail SSL (port 465).
const transportOptions = smtpHost
  ? {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      tls: { rejectUnauthorized: false }
    }
  : {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      tls: { rejectUnauthorized: false }
    };

if (!emailUser || !emailPass) {
  console.warn("⚠️ WARNING: EMAIL_USER or EMAIL_PASS environment variable is missing!");
}

const transporter = nodemailer.createTransport(transportOptions);

// Only verify on startup when explicitly requested.
// This avoids noisy timeouts on hosts that do not reliably allow SMTP checks during boot.
if (shouldVerifyOnStartup) {
  transporter.verify(function(error) {
    if (error) {
      console.warn('Mailer verification failed:', error.message);
    } else {
      console.log('Mail server is ready to take messages');
    }
  });
}

// Export the configured transporter
module.exports = transporter; 