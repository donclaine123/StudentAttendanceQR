const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const resendApiKey = process.env.RESEND_API_KEY;
const brevoApiKey = process.env.BREVO_API_KEY;

// Configure default Nodemailer transport (Restored service: 'gmail' with extended timeouts)
const transportOptions = smtpHost
  ? {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000
    }
  : {
      service: 'gmail',
      auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000
    };

const nodemailerTransporter = nodemailer.createTransport(transportOptions);

// Helper function to send email via Resend HTTP API (Port 443 - HTTPS)
async function sendViaResend(options) {
  const from = options.from || `QR Attendance <onboarding@resend.dev>`;
  const to = Array.isArray(options.to) ? options.to : [options.to];
  
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: from,
      to: to,
      subject: options.subject,
      html: options.html,
      text: options.text
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || `Resend API Error: ${response.statusText}`);
  }
  return { messageId: data.id };
}

// Helper function to send email via Brevo HTTP API (Port 443 - HTTPS)
async function sendViaBrevo(options) {
  const senderEmail = emailUser || "genshin111303@gmail.com";
  const to = Array.isArray(options.to) ? options.to.map(email => ({ email })) : [{ email: options.to }];

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: { name: "QR Code Attendance System", email: senderEmail },
      to: to,
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Brevo API Error: ${response.statusText}`);
  }
  return { messageId: data.messageId };
}

// Export a unified mailer object with a .sendMail method compatible with Nodemailer
const mailer = {
  sendMail: async function(options) {
    // 1. Prefer Resend API if API key provided (HTTPS - Port 443)
    if (resendApiKey) {
      console.log("Sending email via Resend HTTPS API...");
      return await sendViaResend(options);
    }

    // 2. Prefer Brevo API if API key provided (HTTPS - Port 443)
    if (brevoApiKey) {
      console.log("Sending email via Brevo HTTPS API...");
      return await sendViaBrevo(options);
    }

    // 3. Fallback to Nodemailer Gmail SMTP
    try {
      return await nodemailerTransporter.sendMail(options);
    } catch (err) {
      if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'))) {
        console.error("❌ SMTP Connection Timeout Detected!");
        console.error("Render hosting blocks or limits outgoing SMTP connection timeouts.");
        console.error("💡 Solution: Add a free RESEND_API_KEY (resend.com) or BREVO_API_KEY (brevo.com) to your Render Environment Variables.");
      }
      throw err;
    }
  },
  verify: function(callback) {
    if (resendApiKey || brevoApiKey) {
      if (callback) callback(null, true);
      return Promise.resolve(true);
    }
    return nodemailerTransporter.verify(callback);
  }
};

module.exports = mailer;