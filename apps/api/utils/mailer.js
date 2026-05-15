const nodemailer = require('nodemailer');

// Configure Nodemailer transporter using environment variables
const transporter = nodemailer.createTransport({
  service: "gmail", // Or your email provider
  auth: {
    user: process.env.EMAIL_USER, // Make sure these are set in your environment
    pass: process.env.EMAIL_PASS, 
  },
});

// Verify connection configuration on startup (optional but recommended)
transporter.verify(function(error, success) {
  if (error) {
    console.error("Mailer verification failed:", error);
  } else {
    console.log("Mail server is ready to take messages");
  }
});

// Export the configured transporter
module.exports = transporter; 