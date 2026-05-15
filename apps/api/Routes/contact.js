const express = require('express');
const router = express.Router();
const transporter = require('../utils/mailer'); // Path to your Nodemailer transporter
const validator = require('validator'); // Using validator library for robust validation

// HTML Email Template Function
const getContactEmailTemplate = (name, email, subject, message) => {
    // Inline CSS for better email client compatibility
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Contact Form Submission</title>
            <style>
                body {
                    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
                    line-height: 1.6;
                    color: #333333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #ffffff;
                    border: 1px solid #dddddd;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .email-header {
                    background-color: #484b6a; /* Theme color */
                    color: #ffffff;
                    padding: 20px;
                    text-align: center;
                }
                .email-header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .email-body {
                    padding: 20px 30px;
                }
                .email-body p {
                    margin-bottom: 15px;
                }
                .email-body strong {
                    color: #484b6a;
                }
                .field-label {
                    font-weight: bold;
                    color: #484b6a; /* Theme color */
                }
                .message-content {
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-left: 3px solid #484b6a;
                    margin-top: 10px;
                    white-space: pre-wrap; /* Preserve line breaks and spacing in message */
                }
                .email-footer {
                    text-align: center;
                    padding: 15px;
                    font-size: 12px;
                    color: #777777;
                    background-color: #f0f0f0;
                    border-top: 1px solid #dddddd;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>New EazyAttend Contact</h1>
                </div>
                <div class="email-body">
                    <p>You have received a new message from the EazyAttend landing page contact form:</p>
                    <p><span class="field-label">From:</span> ${validator.escape(name)}</p>
                    <p><span class="field-label">Email:</span> <a href="mailto:${validator.escape(email)}">${validator.escape(email)}</a></p>
                    <p><span class="field-label">Subject:</span> ${validator.escape(subject)}</p>
                    <p><span class="field-label">Message:</span></p>
                    <div class="message-content">
                        <p>${validator.escape(message)}</p>
                    </div>
                </div>
                <div class="email-footer">
                    <p>This is an automated message from the EazyAttend Contact Form.</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

router.post('/contact-submit', async (req, res) => {
    const { name, email, subject, message } = req.body;

    // --- Validation ---
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address provided.' });
    }
    // Basic length checks (optional, but good practice)
    if (name.length > 100) {
      return res.status(400).json({ success: false, message: 'Name is too long.' });
    }
    if (subject.length > 200) {
      return res.status(400).json({ success: false, message: 'Subject is too long.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ success: false, message: 'Message is too long.' });
    }

    const mailTo = 'genshin111303@gmail.com';
    const emailSubject = `EazyAttend Inquiry: ${subject}`;
    const emailHtml = getContactEmailTemplate(name, email, subject, message);

    const mailOptions = {
        from: `"EazyAttend Contact Form" <${process.env.EMAIL_USER}>`, // Sender address (your app's email)
        to: mailTo, // Your email address
        replyTo: email, // Set reply-to to the user's email
        subject: emailSubject,
        html: emailHtml
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Your message has been sent successfully! We will get back to you soon.' });
    } catch (error) {
        console.error('Error sending contact form email:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
    }
});

module.exports = router; 