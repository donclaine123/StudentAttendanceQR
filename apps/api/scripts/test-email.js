require('dotenv').config();
const transporter = require('../utils/mailer');

async function testEmail() {
  console.log("Testing email configuration...");
  console.log("EMAIL_USER:", process.env.EMAIL_USER);
  console.log("EMAIL_PASS length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

  try {
    const info = await transporter.verify();
    console.log("Transporter verification SUCCESS:", info);

    console.log("Sending test email...");
    const sendResult = await transporter.sendMail({
      from: `"QR Code Attendance System" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "Test Email from QR Attendance System",
      text: "If you receive this, Nodemailer is working properly!"
    });
    console.log("Email sent successfully! MessageId:", sendResult.messageId);
  } catch (err) {
    console.error("FAILED to send email:");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.error("Full Error:", err);
  }
}

testEmail();
