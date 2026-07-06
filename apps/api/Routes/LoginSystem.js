const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../db");
const bcrypt = require('bcryptjs');
const saltRounds = 10;
const transporter = require('../utils/mailer'); // Import shared transporter

const router = express.Router(); 

const getFrontendBaseUrl = () => {
  const configuredUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:5500').replace(/\/$/, '');

  if (/localhost|127\.0\.0\.1|::1/.test(configuredUrl)) {
    return `${configuredUrl}/apps/web`;
  }

  return configuredUrl;
};


// Email template for verification
const getVerificationEmailTemplate = (verifyUrl, firstName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #484b6a;
      color: white;
      padding: 20px;
      text-align: center;
      border-radius: 5px 5px 0 0;
    }
    .content {
      background-color: #f9f9f9;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 0 0 5px 5px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(to right, #484b6a, #d2d3db);
      color: white !important;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Email Verification</h1>
    </div>
    <div class="content">
      <p>Hello ${firstName},</p>
      <p>Thank you for registering with our QR Code Attendance System. To complete your registration and verify your email address, please click the button below:</p>
      <p style="text-align: center;">
        <a href="${verifyUrl}" class="button">Verify Email Address</a>
      </p>
      <p>If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
      <p style="word-break: break-all; font-size: 12px; color: #666;">${verifyUrl}</p>
      <p>This verification link will expire in 24 hours for security reasons.</p>
      <p>If you did not create an account with us, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>This is an automated message, please do not reply to this email.</p>
      <p>&copy; ${new Date().getFullYear()} QR Code Attendance System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

// 📌 Updated Login Function
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  try {
    // --- Check Admins Table First ---
    const [adminRows] = await db.query(
      "SELECT id, password_hash, first_name, last_name, role FROM admins WHERE email = ?", 
      [email]
    );

    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const passwordMatch = await bcrypt.compare(password, admin.password_hash);

      if (passwordMatch) {
        // Admin authenticated successfully
        
        // Invalidate existing sessions for this admin
        try {
          await db.query(
            `UPDATE sessions SET is_active = FALSE, last_activity = NOW() WHERE user_id = ? AND role = ? AND is_active = TRUE`,
            [admin.id, 'admin']
          );
        } catch (dbError) {
          console.error("Error invalidating existing admin sessions:", dbError);
        }

        // Regenerate session for the admin
        req.session.regenerate(async function(err) {
          if (err) {
            console.error("Error regenerating session for admin:", err);
            return res.status(500).json({ success: false, message: "Admin session regeneration failed" });
          }

          // Set admin session data
          req.session.userId = admin.id;
          req.session.role = admin.role; // Should be 'admin'
          req.session.firstName = admin.first_name;
          req.session.lastName = admin.last_name;
          req.session.email = email;
          req.session.createdAt = new Date().toISOString();
          req.session.lastActivity = new Date().toISOString();
          
          // Store session in DB
           try {
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
              await db.query(
                `INSERT INTO sessions 
                 (session_id, data, expires_at, user_id, role, is_active, created_at, last_activity)
                 VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                 data = VALUES(data), expires_at = VALUES(expires_at), is_active = TRUE, last_activity = NOW()`,
                [req.sessionID, JSON.stringify(req.session), expiresAt, admin.id, admin.role]
              );
            } catch (dbError) {
              console.error("Error creating/updating admin session record:", dbError);
              // Log error but continue
            }

          // Save the session and respond
          req.session.save(function(saveErr) {
            if (saveErr) {
              console.error("Error saving admin session:", saveErr);
              return res.status(500).json({ success: false, message: "Admin session save failed" });
            }
            
            const isProd = process.env.NODE_ENV === 'production';
            const cookieOptions = {
              httpOnly: true, path: '/', maxAge: 24 * 60 * 60 * 1000,
              secure: isProd, sameSite: isProd ? 'none' : 'lax'
            };
            res.cookie('qr_attendance_sid', req.sessionID, cookieOptions);

            return res.json({ 
              success: true,
              role: 'admin', // Explicitly set role
              user: { id: admin.id, firstName: admin.first_name, lastName: admin.last_name, email: email },
              sessionId: req.sessionID,
              redirect: '/admin-dashboard.html' // Redirect to admin dashboard
            });
          });
        });
        return; // Stop execution here if admin login is successful
      }
      // If admin email found but password incorrect, fall through to general invalid message
    }
    
    // --- If not an admin, proceed with Student/Teacher check ---

    // Check both tables (Teachers and Students)
    const [[teachers], [students]] = await Promise.all([
      db.query("SELECT id, password_hash, first_name, last_name FROM teachers WHERE email = ? AND is_verified = TRUE", [email]),
      db.query("SELECT id, password_hash, first_name, last_name, student_id FROM students WHERE email = ? AND is_verified = TRUE", [email])
    ]);

    let user = teachers[0] || students[0];
    const role = teachers[0] ? 'teacher' : (students[0] ? 'student' : null);

    // Authentication checks for student/teacher
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials or account not verified" 
      });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // IMPROVED SESSION MANAGEMENT: First invalidate any existing sessions for this student/teacher
    try {
      await db.query(
        `UPDATE sessions SET is_active = FALSE, last_activity = NOW() WHERE user_id = ? AND role = ? AND is_active = TRUE`,
        [user.id, role]
      );
    } catch (dbError) {
      console.error("Error handling existing student/teacher sessions:", dbError);
    }

    // Regenerate session for student/teacher
    req.session.regenerate(async function(err) {
      if (err) {
        console.error("Error regenerating session:", err);
        return res.status(500).json({ 
          success: false, message: "Session regeneration failed", error: err.message 
        });
      }
      
      // Set session data
      req.session.userId = user.id;
      req.session.role = role;
      req.session.firstName = user.first_name;
      req.session.lastName = user.last_name;
      req.session.email = email;
      req.session.createdAt = new Date().toISOString();
      req.session.lastActivity = new Date().toISOString();
      
      // Add studentId to session if applicable
      if (role === 'student' && students[0]?.student_id) {
        req.session.studentId = students[0].student_id;
      }
      
      // Store session in DB
      try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await db.query(
          `INSERT INTO sessions 
           (session_id, data, expires_at, user_id, role, is_active, created_at, last_activity)
           VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
           data = VALUES(data), expires_at = VALUES(expires_at), is_active = TRUE, last_activity = NOW()`,
          [req.sessionID, JSON.stringify(req.session), expiresAt, user.id, role]
        );
      } catch (dbError) {
        console.error("Error creating/updating session record:", dbError);
        // Continue anyway
      }
      
      // Save the session and respond
      req.session.save(function(saveErr) {
        if (saveErr) {
          console.error("Error saving session:", saveErr);
          return res.status(500).json({ 
            success: false, message: "Session save failed", error: saveErr.message 
          });
        }
        
        const isProd = process.env.NODE_ENV === 'production';
        const cookieOptions = {
          httpOnly: true, path: '/', maxAge: 24 * 60 * 60 * 1000,
          secure: isProd, sameSite: isProd ? 'none' : 'lax'
        };
        res.cookie('qr_attendance_sid', req.sessionID, cookieOptions);
        
        // Prepare user data for response
        const responseUser = {
          id: user.id, firstName: user.first_name, lastName: user.last_name, email: email
        };
        if (role === 'student' && students[0]?.student_id) {
          responseUser.studentId = students[0].student_id; 
        }

        return res.json({ 
          success: true,
          role,
          user: responseUser,
          sessionId: req.sessionID,
          redirect: role === 'teacher' ? '/pages/teacher-dashboard.html' : '/pages/student-dashboard.html'
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, message: "Login failed due to server error.", error: error.message 
    });
  }
});

// 📌 Updated logout endpoint
router.post('/logout', async (req, res) => {
  if (req.session) {
    // Capture user info and session ID for database deletion
    const userId = req.session.userId;
    const role = req.session.role;
    const sessionId = req.sessionID; // Store session ID before destroying
    // Destroy the session
    await new Promise((resolve, reject) => {
    req.session.destroy(err => {
      if (err) {
        console.error('Session destruction error:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Clear the cookie with proper options for production/development
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions = {
        path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax'
    };
    
    // Clear both cookie domains to ensure it's properly removed
    res.clearCookie('qr_attendance_sid', cookieOptions);
    
    // Delete from the database directly to ensure it's gone
    try {
      await db.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    } catch (dbError) {
      console.error('Error deleting session from database:', dbError);
      // Non-critical error, continue
    }
      
      return res.json({
        success: true,
        message: 'Logged out successfully'
    });
  } else {
    res.json({
      success: true,
      message: 'Already logged out'
    });
  }
});


// 📌 Register User
router.post("/register", async (req, res) => {
  const { role, email, firstName, lastName, password, studentId } = req.body;

  try {
    // --- Add Input Validation --- 
    if (!role || !email || !firstName || !lastName || !password) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields: role, email, first name, last name, and password are all required."
        });
    }
    
    // Student ID is required only if role is student
    if (role === 'student' && !studentId) {
        return res.status(400).json({
            success: false,
            message: "Student ID is required for student registration."
        });
    }
    
    // Password strength validation
    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters long."
        });
    }
    
    // Optional: Add email format validation, password strength check here if desired
    // --- End Input Validation ---

    // 🔹 Hash password and generate verification token
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    let userId;
    let isExistingUnverified = false;

    // 🔹 Check if email already exists
    const [teacherRows] = await db.query("SELECT id, is_verified FROM teachers WHERE email = ?", [email]);
    if (teacherRows.length > 0) {
      if (teacherRows[0].is_verified) {
        return res.status(400).json({ success: false, message: "Email already registered as a teacher." });
      }
      if (role !== "teacher") {
        return res.status(400).json({ success: false, message: "Email already registered as a teacher." });
      }
      userId = teacherRows[0].id;
      isExistingUnverified = true;
      await db.query(
        "UPDATE teachers SET password_hash = ?, first_name = ?, last_name = ?, verification_token = ? WHERE id = ?",
        [hashedPassword, firstName, lastName, verificationToken, userId]
      );
    }

    const [studentRows] = await db.query("SELECT id, is_verified FROM students WHERE email = ?", [email]);
    if (studentRows.length > 0) {
      if (studentRows[0].is_verified) {
        return res.status(400).json({ success: false, message: "Email already registered as a student." });
      }
      if (role !== "student") {
        return res.status(400).json({ success: false, message: "Email already registered as a student." });
      }
      userId = studentRows[0].id;
      isExistingUnverified = true;
      await db.query(
        "UPDATE students SET password_hash = ?, first_name = ?, last_name = ?, student_id = ?, verification_token = ? WHERE id = ?",
        [hashedPassword, firstName, lastName, studentId, verificationToken, userId]
      );
    }

    if (!isExistingUnverified) {
      if (role === "teacher") {
        const [result] = await db.query(
          "INSERT INTO teachers (email, password_hash, first_name, last_name, verification_token, is_verified) VALUES (?, ?, ?, ?, ?, ?)",
          [email, hashedPassword, firstName, lastName, verificationToken, false]
        );
        userId = result.insertId;
      } else if (role === "student") {
        const [result] = await db.query(
          "INSERT INTO students (email, password_hash, first_name, last_name, student_id, verification_token, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [email, hashedPassword, firstName, lastName, studentId, verificationToken, false]
        );
        userId = result.insertId;
      } else {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
    }

    // 🔹 Send verification email
    const verifyUrl = `${getFrontendBaseUrl()}/pages/verify.html?token=${verificationToken}`;
    try {
      await transporter.sendMail({
        from: `"QR Code Attendance System" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email - QR Code Attendance System",
        html: getVerificationEmailTemplate(verifyUrl, firstName),
      });
    } catch (mailErr) {
      console.error("❌ Verification email failed to send:", mailErr.message);
      
      // Rollback inserted user record so email is not locked in DB
      try {
        if (role === "teacher") {
          await db.query("DELETE FROM teachers WHERE id = ?", [userId]);
        } else if (role === "student") {
          await db.query("DELETE FROM students WHERE id = ?", [userId]);
        }
      } catch (cleanupErr) {
        console.error("Error cleaning up unverified user:", cleanupErr.message);
      }

      return res.status(500).json({
        success: false,
        message: `Failed to send verification email: ${mailErr.message}. Please check EMAIL_USER and EMAIL_PASS on Render.`
      });
    }

    // Send back requiresVerification flag and user email
    res.json({ 
      success: true, 
      message: "Registration successful! Check your email for verification.",
      userId: userId,
      requiresVerification: true, // Explicitly add this flag
      email: email // Add the email used for registration
    });
  } catch (err) {
    console.error("Registration error CATCH BLOCK entered:", err);
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    console.error("Error Stack:", err.stack); // Log the full stack trace
    res.status(500).json({ 
      success: false, 
      message: "Registration failed",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


// 📌 Verify Email
router.get("/verify", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing verification token" 
    });
  }

  try {
    // 🔹 Check teachers table
    const [teacherRows] = await db.query("SELECT id FROM teachers WHERE verification_token = ?", [token]);
    if (teacherRows.length > 0) {
      await db.query(
        "UPDATE teachers SET is_verified = TRUE, verification_token = NULL WHERE id = ?",
        [teacherRows[0].id]
      );
      return res.json({ 
        success: true, 
        message: "Email verified! You can now log in.",
        redirectUrl: "/pages/login.html"
      });
    }

    // 🔹 Check students table
    const [studentRows] = await db.query("SELECT id FROM students WHERE verification_token = ?", [token]);
    if (studentRows.length > 0) {
      await db.query(
        "UPDATE students SET is_verified = TRUE, verification_token = NULL WHERE id = ?",
        [studentRows[0].id]
      );
      return res.json({ 
        success: true, 
        message: "Email verified! You can now log in.",
        redirectUrl: "/pages/login.html"
      });
    }

    // 🔹 If no matching token
    res.status(400).json({ 
      success: false, 
      message: "Invalid or expired verification token.",
      redirectUrl: "/pages/login.html"
    });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Verification failed due to a server error. Please try again.",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 📌 Update check-auth endpoint
router.get('/check-auth', async (req, res) => {
  try {
    const sessionId = req.cookies.qr_attendance_sid;

    // First check if we have a valid session cookie
    if (sessionId) {
      // Verify the session in the database
      const [sessions] = await db.query(
        `SELECT * FROM sessions 
         WHERE session_id = ? AND is_active = TRUE AND expires_at > NOW()`,
        [sessionId]
      );

      if (sessions.length > 0) {
        const sessionData = JSON.parse(sessions[0].data);
        
        // Update last activity
        await db.query(
          `UPDATE sessions SET last_activity = NOW() WHERE session_id = ?`,
          [sessionId]
        );

        // Prepare response user object
        const responseUser = {
            id: sessions[0].user_id,
            role: sessions[0].role,
            firstName: sessionData.firstName,
            lastName: sessionData.lastName
        };
        
        // Add studentId if it exists in session data
        if (sessionData.studentId) {
            responseUser.studentId = sessionData.studentId;
        }

        return res.json({
          authenticated: true,
          user: responseUser // Send the prepared object
        });
      } else {
        // Invalid session - clear the cookie
        res.clearCookie('qr_attendance_sid', {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'none'
        });
      }
    }

    // If we reach here, check headers as absolute last resort
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    if (userId && userRole) {
      // Look up the most recent active session for this user
      const [sessions] = await db.query(
        `SELECT * FROM sessions 
         WHERE user_id = ? AND role = ? AND is_active = TRUE AND expires_at > NOW()
         ORDER BY last_activity DESC, created_at DESC LIMIT 1`,
        [userId, userRole]
      );

      if (sessions.length > 0) {
          const sessionData = JSON.parse(sessions[0].data);
        
        // IMPORTANT: Check if the session is actually valid (not expired)
        // This prevents renewing expired sessions
        const expiresAt = new Date(sessions[0].expires_at);
        const now = new Date();
        
        if (expiresAt > now) {
          // Only set cookie if session is truly valid and not expired
        res.cookie('qr_attendance_sid', sessions[0].session_id, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Prepare response user object (also for header auth case)
        const headerAuthResponseUser = {
            id: sessions[0].user_id,
            role: sessions[0].role,
            firstName: sessionData.firstName,
            lastName: sessionData.lastName
        };
        
        // Add studentId if it exists in session data
        if (sessionData.studentId) {
            headerAuthResponseUser.studentId = sessionData.studentId;
        }

          return res.json({
            authenticated: true,
            user: headerAuthResponseUser // Send the prepared object
          });
        }
        // If we get here, session exists but is expired - don't renew it
      }
    }

    // No valid session found
    res.json({
      authenticated: false,
      message: "Session expired. Please log in again."
    });

  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({
      authenticated: false,
      message: "Error checking authentication status"
    });
  }
});


// 📌 Updated Direct Teacher Login
router.post('/direct-teacher-login', async (req, res) => {
  try {
    const { teacher_id, key } = req.body;
    
    // Validate input
    if (!teacher_id || !key) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Check the direct login key is valid
    const [[rows]] = await db.query(
      'SELECT id, first_name, last_name FROM teachers WHERE id = ? AND direct_login_key = ? AND is_verified = TRUE',
      [teacher_id, key]
    );
    
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const teacher = rows[0];
    
    // Regenerate session to ensure a clean state
    req.session.regenerate(function(err) {
      if (err) {
        console.error("Error regenerating session:", err);
        return res.status(500).json({ 
          success: false, 
          message: "Session creation failed", 
          error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
      }
      
      // Set session data after regeneration
      req.session.userId = teacher.id;
      req.session.role = 'teacher';
      req.session.firstName = teacher.first_name;
      req.session.lastName = teacher.last_name;
      req.session.createdAt = new Date();
      
      // Save session explicitly once
      req.session.save(function(saveErr) {
        if (saveErr) {
          console.error("Error saving session:", saveErr);
          return res.status(500).json({ 
            success: false, 
            message: "Session save failed", 
            error: process.env.NODE_ENV === 'development' ? saveErr.message : undefined
          });
        }
        
        // Ensure cookie is set with the current session ID
        if (req.sessionID) {
          res.cookie('qr_attendance_sid', req.sessionID, {
            httpOnly: true,
            path: '/',
            maxAge: 24 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
          });
        }
        
        res.json({
          success: true,
          role: 'teacher',
          user: {
            id: teacher.id,
            firstName: teacher.first_name,
            lastName: teacher.last_name
          },
          sessionId: req.sessionID,
          redirect: '/pages/teacher-dashboard.html'
        });
      });
    });
  } catch (error) {
    console.error('Direct teacher login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 📌 Session re-authentication endpoint for LocalStorage fallback
router.post("/reauth", async (req, res) => {
  const { userId, role } = req.body;
  
  if (!userId || !role) {
    return res.status(400).json({
      success: false,
      message: "Missing userId or role"
    });
  }
  
  try {
    // First check if there's already an active session for this user
    const [existingSessions] = await db.query(
      `SELECT session_id, data FROM sessions 
       WHERE user_id = ? AND role = ? AND is_active = TRUE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, role]
    );
    
    // If an active session exists, use it instead of creating a new one
    if (existingSessions.length > 0) {
      const existingSessionId = existingSessions[0].session_id;
      
      // Update the session data
      req.session.userId = userId;
      req.session.role = role;
      
      // Get name information from database
      const [userInfo] = await db.query(
        `SELECT first_name, last_name FROM ${role}s WHERE id = ?`,
        [userId]
      );
      
      if (userInfo.length > 0) {
        req.session.firstName = userInfo[0].first_name;
        req.session.lastName = userInfo[0].last_name;
      }
      
      // Update last activity
      await db.query(
        `UPDATE sessions SET last_activity = NOW() WHERE session_id = ?`,
        [existingSessionId]
      );
      
      // Set the session cookie explicitly
      const isProd = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax'
      };
      
      res.cookie('qr_attendance_sid', existingSessionId, cookieOptions);
      
      return res.json({
        success: true,
        message: "Session reestablished",
        sessionId: existingSessionId,
        user: {
          id: userId,
          role: role,
          firstName: req.session.firstName,
          lastName: req.session.lastName
        }
      });
    }
    
    // If no active session, create a new one
    // Verify the user exists in the database
    let userExists = false;
    let firstName = null;
    let lastName = null;
    
    if (role === 'teacher') {
      const [teachers] = await db.query(
        "SELECT id, first_name, last_name FROM teachers WHERE id = ? AND is_verified = TRUE",
        [userId]
      );
      if (teachers.length > 0) {
        userExists = true;
        firstName = teachers[0].first_name;
        lastName = teachers[0].last_name;
      }
    } else if (role === 'student') {
      const [students] = await db.query(
        "SELECT id, first_name, last_name FROM students WHERE id = ? AND is_verified = TRUE",
        [userId]
      );
      if (students.length > 0) {
        userExists = true;
        firstName = students[0].first_name;
        lastName = students[0].last_name;
      }
    }
    
    if (!userExists) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID or role"
      });
    }
    
    // Clear any existing session data and create a new one
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regeneration failed:", err);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create new session" 
        });
      }
      
      // Set session data
      req.session.userId = userId;
      req.session.role = role;
      req.session.firstName = firstName;
      req.session.lastName = lastName;
      
      // Save session
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("Session save failed:", saveErr);
          return res.status(500).json({ 
            success: false, 
            message: "Failed to save session" 
          });
        }
        
        // Set cookie with proper environment settings
        const isProd = process.env.NODE_ENV === 'production';
        const cookieOptions = {
          httpOnly: true,
          path: '/',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          secure: isProd,
          sameSite: isProd ? 'none' : 'lax'
        };
        
        res.cookie('qr_attendance_sid', req.sessionID, cookieOptions);
        
        return res.json({
      success: true, 
          message: "Session created",
          sessionId: req.sessionID,
          user: {
            id: userId,
            role: role,
            firstName: firstName,
            lastName: lastName
          }
        });
      });
    });
  } catch (error) {
    console.error("Re-authentication error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during re-authentication" 
    });
  }
});

// Add endpoint to get student classes
router.get("/student-classes/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    // Verify the student exists
    const [students] = await db.query(
      "SELECT id FROM students WHERE id = ?",
      [studentId]
    );
    
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }
    
    // For now, return all classes since we don't have a student-class enrollment table yet
    // In a real application, you would query the enrollment table
    const [classes] = await db.query(
      "SELECT id, class_name, subject, description FROM class_records WHERE is_active = TRUE"
    );
    
    return res.json({
      success: true,
      classes: classes
    });
  } catch (error) {
    console.error("Error getting student classes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve classes"
    });
  }
});

// Route for handling password reset form submission
router.post('/reset-password', async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;

    // 1. Basic Validation
    if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Missing required fields (token, newPassword, confirmPassword).' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 2. Verify token
        const selectQuery = "SELECT user_id, user_role FROM password_resets WHERE token = ? AND expires_at > NOW()";
        const [results] = await connection.query(selectQuery, [token]);

        if (results.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
        }

        const { user_id: userId, user_role: userRole } = results[0];

        // 3. Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // 4. Determine table and update password
        let tableName;
        if (userRole === 'student') {
            tableName = 'students';
        } else if (userRole === 'teacher') {
            tableName = 'teachers';
        } else {
            // Should not happen if role was stored correctly
            await connection.rollback();
            return res.status(500).json({ success: false, message: 'Invalid user role associated with token.' });
        }

        const updateQuery = `UPDATE ${tableName} SET password_hash = ? WHERE id = ?`;
        const [updateResult] = await connection.query(updateQuery, [hashedPassword, userId]);

        if (updateResult.affectedRows === 0) {
            // User might have been deleted between token generation and reset attempt
            await connection.rollback();
            console.warn(`Password Reset: User ${userId} (Role: ${userRole}) not found during password update.`);
            return res.status(404).json({ success: false, message: 'User associated with token not found.' });
        }

        // 5. Delete the used token
        const deleteQuery = "DELETE FROM password_resets WHERE token = ?";
        await connection.query(deleteQuery, [token]);

        await connection.commit();
        res.json({ success: true, message: 'Password has been successfully reset.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error during password reset process for token ${token}:`, error);
        res.status(500).json({ success: false, message: 'An error occurred while resetting the password.' });
    } finally {
        if (connection) connection.release();
  }
});

module.exports = router;

