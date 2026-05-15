// QrAttendance-Backend/Routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Assuming db.js is in the parent directory
const crypto = require('crypto');
const transporter = require('../utils/mailer'); // Correct path to shared transporter
const bcrypt = require('bcryptjs'); // <-- Re-add bcryptjs

// Import authentication middleware (we will add requireAdmin here later)
// Assuming authMiddleware.js exports authenticate and will export requireAdmin
const { authenticate, requireRole } = require('./authMiddleware'); 

const getFrontendBaseUrl = () => {
    const configuredUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:5500').replace(/\/$/, '');

    if (/localhost|127\.0\.0\.1|::1/.test(configuredUrl)) {
        return `${configuredUrl}/apps/web`;
    }

    return configuredUrl;
};

// Helper function to log admin actions
async function logAdminAction(dbOrConnection, adminId, actionType, targetType, targetId, details) {
    const query = `
        INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, details)
        VALUES (?, ?, ?, ?, ?)
    `;
    // Convert details object to JSON string if it's an object
    const detailsString = (typeof details === 'object' && details !== null) ? JSON.stringify(details) : details;
    const params = [adminId, actionType, targetType, targetId, detailsString];

    try {
        // Use the passed connection or the global db pool
        await dbOrConnection.query(query, params);
    } catch (logError) {
        // Log the error but don't let it fail the main request
        console.error('!!! Failed to write to admin_audit_log !!!', logError);
        console.error('Log details:', { adminId, actionType, targetType, targetId, detailsString });
    }
}

// --- Password Reset Email Template --- 
const getPasswordResetEmailTemplate = (resetLink, firstName = 'User', expiryMinutes = 60) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request</title>
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
      background-color: #484b6a; /* Match verification header */
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
      background: linear-gradient(to right, #484b6a, #9394a5); /* Adjusted gradient slightly */
      color: white !important; /* Ensure text is white */
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #666;
    }
    .link-fallback {
       word-break: break-all; 
       font-size: 12px; 
       color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello ${firstName},</p>
      <p>You requested a password reset for your EazyAttend account. Please click the button below to set a new password:</p>
      <p style="text-align: center;">
        <a href="${resetLink}" class="button">Reset Password</a>
      </p>
      <p>If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
      <p class="link-fallback">${resetLink}</p>
      <p>This link will expire in ${expiryMinutes} minutes for security reasons.</p>
      <p>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
    </div>
    <div class="footer">
      <p>This is an automated message, please do not reply to this email.</p>
      <p>&copy; ${new Date().getFullYear()} EazyAttend. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;
// --- End Password Reset Email Template ---

// Apply authentication and admin check to all routes in this file
router.use(authenticate, requireRole('admin'));

// --- User Management Routes ---

// GET /admin/users - Fetch all users (students and teachers)
router.get('/users', async (req, res) => {
    const adminId = req.user.id;
    const { 
        searchTerm, 
        role: roleFilter, 
        status: statusFilter,
        sortBy, // New: for sorting
        sortOrder, // New: 'asc' or 'desc'
        lastActivityPeriod // New: for activity period filter
    } = req.query;

    try {
        // Base queries
        const baseStudentQuery = `
            SELECT 
                s.id, s.student_id, s.first_name, s.last_name, s.email, s.is_verified, s.created_at, 
                'student' as role,
                MAX(sess.last_activity) as last_activity
            FROM students s
            LEFT JOIN sessions sess ON s.id = sess.user_id AND sess.role = 'student'
        `;
        const baseTeacherQuery = `
            SELECT 
                t.id, NULL as student_id, t.first_name, t.last_name, t.email, t.is_verified, t.created_at, 
                'teacher' as role,
                MAX(sess.last_activity) as last_activity
            FROM teachers t
            LEFT JOIN sessions sess ON t.id = sess.user_id AND sess.role = 'teacher'
        `;
        
        const studentConditions = [];
        const teacherConditions = [];
        const studentParams = [];
        const teacherParams = [];
        const havingConditions = []; 
        const havingParams = []; // Note: havingParams are not used with NOW() - INTERVAL syntax

        // --- Build Search Conditions --- 
        if (searchTerm) {
            const searchTermLike = `%${searchTerm}%`;
            studentConditions.push(`(s.first_name LIKE ? OR s.last_name LIKE ? OR s.email LIKE ? OR s.student_id LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?)`);
            studentParams.push(searchTermLike, searchTermLike, searchTermLike, searchTermLike, searchTermLike);
            teacherConditions.push(`(t.first_name LIKE ? OR t.last_name LIKE ? OR t.email LIKE ? OR CONCAT(t.first_name, ' ', t.last_name) LIKE ?)`);
            teacherParams.push(searchTermLike, searchTermLike, searchTermLike, searchTermLike);
        }

        // --- Build Status Conditions --- 
        if (statusFilter === 'verified' || statusFilter === 'pending') {
            const statusValue = statusFilter === 'verified';
            studentConditions.push(`s.is_verified = ?`);
            teacherConditions.push(`t.is_verified = ?`);
            studentParams.push(statusValue);
            teacherParams.push(statusValue);
        }
        
        // --- Build Last Activity Period Filtering (HAVING clause) ---
        if (lastActivityPeriod) {
            const now = 'NOW()'; // Using SQL NOW() function
            // Determine if we are filtering on the combined set or individual sets
            const isCombinedQuery = roleFilter !== 'student' && roleFilter !== 'teacher';
            const activityColumn = isCombinedQuery ? 'last_activity' : 'MAX(sess.last_activity)';

            switch (lastActivityPeriod) {
                case 'last_hour':
                    havingConditions.push(`${activityColumn} >= ${now} - INTERVAL 1 HOUR`);
                    break;
                case 'last_24_hours':
                    havingConditions.push(`${activityColumn} >= ${now} - INTERVAL 24 HOUR`);
                    break;
                case 'last_7_days':
                    havingConditions.push(`${activityColumn} >= ${now} - INTERVAL 7 DAY`);
                    break;
                case 'last_30_days':
                    havingConditions.push(`${activityColumn} >= ${now} - INTERVAL 30 DAY`);
                    break;
                case 'not_active_last_30_days':
                    havingConditions.push(`(${activityColumn} < ${now} - INTERVAL 30 DAY OR ${activityColumn} IS NULL)`);
                    break;
                case 'never_active':
                    havingConditions.push(`${activityColumn} IS NULL`);
                    break;
            }
        }

        // --- Group By Clauses ---
        // Necessary for MAX(last_activity) to work correctly per user
        const studentGroupBy = " GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.email, s.is_verified, s.created_at";
        const teacherGroupBy = " GROUP BY t.id, t.first_name, t.last_name, t.email, t.is_verified, t.created_at";

        // --- Build Last Activity Filtering (HAVING clause) ---
        // This section is now effectively replaced/augmented by the switch statement above.
        // We just need to construct the havingClause from havingConditions.
        const havingClause = havingConditions.length > 0 ? ` HAVING ${havingConditions.join(' AND ')}` : '';


        // --- Construct WHERE Clauses --- 
        const studentWhereClause = studentConditions.length > 0 ? ` WHERE ${studentConditions.join(' AND ')}` : '';
        const teacherWhereClause = teacherConditions.length > 0 ? ` WHERE ${teacherConditions.join(' AND ')}` : '';

        // --- Determine Final Query and Params based on Role Filter --- 
        let finalQuery = '';
        let finalParams = [];
        let baseQueryUnion = '';

        if (roleFilter === 'student') {
            baseQueryUnion = `(${baseStudentQuery + studentWhereClause + studentGroupBy})`;
            finalParams = [...studentParams, ...havingParams];
        } else if (roleFilter === 'teacher') {
            baseQueryUnion = `(${baseTeacherQuery + teacherWhereClause + teacherGroupBy})`;
            finalParams = [...teacherParams, ...havingParams];
        } else {
            // No role filter or 'all', combine both with UNION
            const studentQueryPart = `(${baseStudentQuery + studentWhereClause + studentGroupBy})`;
            const teacherQueryPart = `(${baseTeacherQuery + teacherWhereClause + teacherGroupBy})`;
            baseQueryUnion = `${studentQueryPart} UNION ALL ${teacherQueryPart}`;
            finalParams = [...studentParams, ...teacherParams, ...havingParams, ...havingParams]; // Duplicate havingParams if applied to both parts of UNION
                                                                                             // This might need adjustment if UNION is before HAVING
        }
        
        // If no role filter, apply having clause to the entire union
        // A more robust way is to wrap the UNION in a subquery if HAVING needs to apply to the combined set
        // For now, let's construct it to apply HAVING to each part if there's no role filter,
        // or construct a subquery if roleFilter is not student or teacher.

        if (roleFilter !== 'student' && roleFilter !== 'teacher') {
             finalQuery = `SELECT * FROM (${baseQueryUnion}) AS combined_users ${havingClause}`;
             finalParams = [...studentParams, ...teacherParams, ...havingParams]; // Simpler params for wrapped query
        } else {
            finalQuery = `${baseQueryUnion} ${havingClause}`; // Apply having directly if single type
        }


        // --- Build Order By Clause ---
        let orderByClause = " ORDER BY last_name, first_name"; // Default sort
        if (sortBy) {
            const validSortColumns = ['id', 'first_name', 'last_name', 'email', 'role', 'is_verified', 'last_activity', 'student_id'];
            if (validSortColumns.includes(sortBy)) {
                const orderDirection = (sortOrder && sortOrder.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
                // For last_activity, ensure NULLs are handled (e.g., NULLS LAST or NULLS FIRST depending on DB and desired behavior)
                // MySQL treats NULLs as smallest by default in ASC, largest in DESC. This is usually fine.
                orderByClause = ` ORDER BY ${sortBy} ${orderDirection}, last_name ${orderDirection}, first_name ${orderDirection}`;
            }
        }
        finalQuery += orderByClause;

        const [users] = await db.query(finalQuery, finalParams);
        
        res.json({ success: true, users });

    } catch (error) {
        console.error("Admin: Error fetching filtered/searched users:", error);
        // Send detailed error in development, generic in production
        const errorMessage = process.env.NODE_ENV === 'development' ? error.message : "Failed to fetch users list.";
        res.status(500).json({ success: false, message: errorMessage });
    }
});

// GET /admin/users/:id - Fetch details for a specific user
router.get('/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        let user = null;
        let role = null;

        // Check students table
        const [students] = await db.query(
            "SELECT id, student_id, first_name, last_name, email, is_verified FROM students WHERE id = ?", 
            [userId]
        );
        if (students.length > 0) {
            user = students[0];
            role = 'student';
        } else {
            // If not found in students, check teachers table
            const [teachers] = await db.query(
                 "SELECT id, first_name, last_name, email, is_verified FROM teachers WHERE id = ?", 
                 [userId]
            );
            if (teachers.length > 0) {
                user = teachers[0];
                role = 'teacher';
            } else {
                 // TODO: Consider checking admin table if admins have separate IDs or are teachers
            }
        }

        if (user) {
            res.json({ success: true, user: { ...user, role } }); // Add role to the user object
        } else {
            res.status(404).json({ success: false, message: "User not found." });
        }

    } catch (error) {
        console.error(`Admin: Error fetching user ${userId}:`, error);
        res.status(500).json({ success: false, message: "Failed to fetch user details." });
    }
});

// GET /admin/teachers - Fetch all teachers (for dropdowns, etc.)
router.get('/teachers', async (req, res) => {
    try {
        const [teachers] = await db.query(
            "SELECT id, first_name, last_name FROM teachers ORDER BY last_name, first_name"
        );
        res.json({ success: true, teachers });
    } catch (error) {
        console.error("Admin: Error fetching teachers list:", error);
        res.status(500).json({ success: false, message: "Failed to fetch teachers list." });
    }
});

// PUT /admin/users/:id - Update user details
router.put('/users/:id', async (req, res) => {
    const userIdToUpdate = req.params.id;
    const adminId = req.user.id;
    const { firstName, lastName, email, studentId } = req.body; // Get data from request body

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Determine user role (check both tables)
        let role = null;
        const [students] = await connection.query("SELECT id FROM students WHERE id = ?", [userIdToUpdate]);
        if (students.length > 0) {
            role = 'student';
        } else {
            const [teachers] = await connection.query("SELECT id FROM teachers WHERE id = ?", [userIdToUpdate]);
            if (teachers.length > 0) {
                role = 'teacher';
            } else {
                // Optional: check admins table if they are separate
            }
        }

        if (!role) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "User not found to update." });
        }

        // 2. Construct and Execute UPDATE query based on role
        let updateQuery;
        let queryParams;

        if (role === 'student') {
            // Update students table (include student_id if provided)
            updateQuery = "UPDATE students SET first_name = ?, last_name = ?, email = ?";
            queryParams = [firstName, lastName, email];
            if (studentId !== undefined) { // Only update studentId if it was passed
                updateQuery += ", student_id = ?";
                queryParams.push(studentId || null); // Handle empty string as null
            }
            updateQuery += " WHERE id = ?";
            queryParams.push(userIdToUpdate);
            
        } else if (role === 'teacher') {
            // Update teachers table (studentId is ignored for teachers)
            updateQuery = "UPDATE teachers SET first_name = ?, last_name = ?, email = ? WHERE id = ?";
            queryParams = [firstName, lastName, email, userIdToUpdate];
        }
        // Add more roles if needed (e.g., 'admin')

        const [result] = await connection.query(updateQuery, queryParams);

        if (result.affectedRows === 0) {
             // This shouldn't happen if the previous check found the user, but good practice
            await connection.rollback();
            console.warn(`Admin Update: User ${userIdToUpdate} found but update affected 0 rows.`);
            return res.status(404).json({ success: false, message: "User found but update failed." });
        }

        // Prepare details for logging
        let logDetails = { updatedFields: Object.keys(req.body) };
        if (role === 'student' && studentId !== undefined) {
            logDetails.student_id = studentId || null;
        }
        await logAdminAction(connection, adminId, 'USER_UPDATE', role, userIdToUpdate, logDetails);

        await connection.commit();
        res.json({ success: true, message: "User updated successfully." });

    } catch (error) {
        if (connection) await connection.rollback(); // Rollback on error
        console.error(`Admin: Error updating user ${userIdToUpdate}:`, error);
        // Check for specific errors like duplicate email if necessary
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ success: false, message: "Email address already in use." });
        }
        res.status(500).json({ success: false, message: "Failed to update user details." });
    } finally {
        if (connection) connection.release();
    }
});

// PUT /admin/users/:id/verify - Update user verification status
router.put('/users/:id/verify', async (req, res) => {
    const userIdToUpdate = req.params.id;
    const adminId = req.user.id; // From authenticate middleware
    const { is_verified } = req.body; // Expecting { "is_verified": true } or { "is_verified": false }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // --- Determine User Role and Execute Update ---
        let role = null;
        let tableName = null;

        const [students] = await connection.query("SELECT id FROM students WHERE id = ?", [userIdToUpdate]);
        if (students.length > 0) {
            role = 'student';
            tableName = 'students';
        } else {
            const [teachers] = await connection.query("SELECT id FROM teachers WHERE id = ?", [userIdToUpdate]);
            if (teachers.length > 0) {
                role = 'teacher';
                tableName = 'teachers';
            }
            // Add admin check if necessary
        }

        if (!role) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // --- Execute the Update ---
        const updateQuery = `UPDATE ${tableName} SET is_verified = ? WHERE id = ?`;
        const [result] = await connection.query(updateQuery, [is_verified, userIdToUpdate]);

        if (result.affectedRows === 0) {
            // Should not happen if user was found, but good practice
            await connection.rollback();
            console.warn(`Admin Verify: User ${userIdToUpdate} found but update affected 0 rows.`);
            return res.status(404).json({ success: false, message: "User found but update failed." });
        }

        // Fetch student_id if applicable for details
        let verifyLogDetails = { is_verified };
        if (role === 'student') {
            const [stDetails] = await connection.query("SELECT student_id FROM students WHERE id = ?", [userIdToUpdate]);
            if (stDetails.length > 0) {
                verifyLogDetails.student_id = stDetails[0].student_id;
            }
        }
        await logAdminAction(connection, adminId, is_verified ? 'USER_VERIFY' : 'USER_UNVERIFY', role, userIdToUpdate, verifyLogDetails);

        await connection.commit();
        res.json({ success: true, message: `User verification status updated successfully to ${is_verified}.` });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error updating verification status for user ${userIdToUpdate}:`, error);
        res.status(500).json({ success: false, message: "Failed to update user verification status." });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /admin/users/:id - Delete a user
router.delete('/users/:id', async (req, res) => {
    const userIdToDelete = req.params.id;
    const adminId = req.user.id;

    // Prevent admin from deleting themselves (important safety check!)
    if (String(userIdToDelete) === String(adminId)) { 
        return res.status(403).json({ success: false, message: "Cannot delete your own admin account." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // --- Get user details BEFORE deleting for audit log --- 
        let userDetailsForLog = null;

        // 1. Determine user role and check existence
        let role = null;
        let tableName = '';
        const [students] = await connection.query("SELECT id, first_name, last_name, email, student_id FROM students WHERE id = ?", [userIdToDelete]);
        if (students.length > 0) {
            role = 'student';
            tableName = 'students';
            userDetailsForLog = students[0]; // Store details
        } else {
            const [teachers] = await connection.query("SELECT id, first_name, last_name, email FROM teachers WHERE id = ?", [userIdToDelete]);
            if (teachers.length > 0) {
                role = 'teacher';
                tableName = 'teachers';
                userDetailsForLog = teachers[0]; // Store details
            } else {
                // Optional: check admins table if they are separate
            }
        }

        if (!role) {
            await connection.rollback(); // Rollback even if not found
            return res.status(404).json({ success: false, message: "User not found to delete." });
        }

        // 2. Execute DELETE query
        const deleteQuery = `DELETE FROM ${tableName} WHERE id = ?`;
        const [result] = await connection.query(deleteQuery, [userIdToDelete]);

        if (result.affectedRows === 0) {
            // User existed but wasn't deleted (shouldn't normally happen here)
            await connection.rollback();
            console.warn(`Admin Delete: User ${userIdToDelete} found but delete affected 0 rows.`);
            return res.status(500).json({ success: false, message: "User found but deletion failed unexpectedly." });
        }

        // 3. Optional: Handle related data (e.g., unassign classes for a deleted teacher?)
        //    For simplicity, we'll skip complex cleanup for now. 

        await connection.commit();

        // Log action AFTER commit (or could be before if preferred, but after ensures it happened)
        // Since connection is released in finally, use the main db pool here.
        await logAdminAction(db, adminId, 'USER_DELETE', role, userIdToDelete, userDetailsForLog);

        res.json({ success: true, message: `User (${role}) deleted successfully.` });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error deleting user ${userIdToDelete}:`, error);
        res.status(500).json({ success: false, message: "Failed to delete user." });
    } finally {
        if (connection) connection.release();
    }
});

// POST /admin/users/:id/reset-password - Trigger password reset for a user
router.post('/users/:id/reset-password', async (req, res) => {
    const userIdToReset = req.params.id;
    const adminId = req.user.id;
    const frontendBaseUrl = getFrontendBaseUrl();

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Find the user and their email
        let userEmail = null;
        let userRole = null;
        const [students] = await connection.query("SELECT email FROM students WHERE id = ?", [userIdToReset]);
        if (students.length > 0) {
            userEmail = students[0].email;
            userRole = 'student';
        } else {
            const [teachers] = await connection.query("SELECT email FROM teachers WHERE id = ?", [userIdToReset]);
            if (teachers.length > 0) {
                userEmail = teachers[0].email;
                userRole = 'teacher';
            } else {
                // User not found in students or teachers
                await connection.rollback();
                return res.status(404).json({ success: false, message: "User not found." });
            }
        }

        if (!userEmail) {
            // Should not happen if user was found, but safety check
            await connection.rollback();
            return res.status(500).json({ success: false, message: "User found but email is missing." });
        }

        // 2. Generate secure token and expiry
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiryMinutes = 60; // Token valid for 60 minutes
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

        // 3. Store token and role in the database
        const insertQuery = "INSERT INTO password_resets (user_id, user_role, token, expires_at) VALUES (?, ?, ?, ?)";
        await connection.query(insertQuery, [userIdToReset, userRole, resetToken, expiresAt]);

        // 4. Construct Reset Link
        const resetLink = `${frontendBaseUrl}/pages/reset-password.html?token=${resetToken}`; // Point to the new HTML page
        // NOTE: The page /reset-password.html needs to exist on your *QrCode-Attendance* frontend!

        // 5. Send Email using Nodemailer
        try {
            // Optional: Fetch user's first name to personalize email
            let firstName = 'User'; // Default name
            const nameQuery = `SELECT first_name FROM ${userRole === 'student' ? 'students' : 'teachers'} WHERE id = ?`;
            const [nameResult] = await connection.query(nameQuery, [userIdToReset]);
            if (nameResult.length > 0) {
                firstName = nameResult[0].first_name;
            }

            await transporter.sendMail({
                from: `"EazyAttend No-Reply" <${process.env.EMAIL_USER}>`, 
                to: userEmail,
                subject: 'Reset Your EazyAttend Password',
                // Use the new template function for HTML body
                html: getPasswordResetEmailTemplate(resetLink, firstName, expiryMinutes), 
                // Optional: Keep a simple text version as fallback
                text: `Hello ${firstName},\n\nYou requested a password reset. Click this link to reset your password: ${resetLink}\nIf you did not request this, please ignore this email. This link expires in ${expiryMinutes} minutes.` 
            });
        } catch (emailError) {
            console.error(`Failed to send password reset email to ${userEmail}:`, emailError);
            // Decide if this should be a fatal error. Maybe log it but still commit the token?
            // For now, we'll rollback and return an error to the admin.
            await connection.rollback();
            return res.status(500).json({ success: false, message: "User found, but failed to send reset email." });
        }
        
        // ======================================================

        // Prepare details for logging
        let resetLogDetails = { email: userEmail };
        if (userRole === 'student') {
             const [stDetails] = await connection.query("SELECT student_id FROM students WHERE id = ?", [userIdToReset]);
            if (stDetails.length > 0) {
                resetLogDetails.student_id = stDetails[0].student_id;
            }
        }
        await logAdminAction(connection, adminId, 'USER_PASSWORD_RESET_TRIGGER', userRole, userIdToReset, resetLogDetails);

        await connection.commit();
        res.json({ success: true, message: `Password reset initiated for user ${userIdToReset}. Check their email.` }); // Updated success message

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error initiating password reset for user ${userIdToReset}:`, error);
        res.status(500).json({ success: false, message: "Failed to initiate password reset." });
    } finally {
        if (connection) connection.release();
    }
});

// POST /admin/users - Create a new user (student or teacher)
// <-- Re-insert the POST /users route handler here
router.post('/users', async (req, res) => {
    const adminId = req.user.id;
    const {
        firstName, lastName, email, password,
        role, // Expecting 'student' or 'teacher'
        studentId // Optional, only for students
    } = req.body;

    // --- Basic Validation --- 
    if (!firstName || !lastName || !email || !password || !role) {
        return res.status(400).json({ success: false, message: "Missing required fields (firstName, lastName, email, password, role)." });
    }
    if (role !== 'student' && role !== 'teacher') {
        return res.status(400).json({ success: false, message: "Invalid role specified. Must be 'student' or 'teacher'." });
    }
    if (role === 'student' && !studentId) {
         return res.status(400).json({ success: false, message: "Student ID is required for role 'student'." });
    }
    // Add more validation if needed (e.g., email format, password complexity)

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // --- Check for existing email --- 
        const [existingStudent] = await connection.query("SELECT id FROM students WHERE email = ?", [email]);
        const [existingTeacher] = await connection.query("SELECT id FROM teachers WHERE email = ?", [email]);
        // Optional: Check admins table too if emails must be globally unique
        if (existingStudent.length > 0 || existingTeacher.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Email address already in use." });
        }
        
        // --- Check for existing Student ID (if applicable) ---
        if (role === 'student') {
             const [existingStId] = await connection.query("SELECT id FROM students WHERE student_id = ?", [studentId]);
             if (existingStId.length > 0) {
                 await connection.rollback();
                 return res.status(409).json({ success: false, message: "Student ID already exists." });
             }
        }

        // --- Hash Password --- 
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // --- Insert into appropriate table --- 
        let tableName = ''; // Define tableName here
        let insertQuery = '';
        let queryParams = [];
        const defaultIsVerified = true; // Admin-created users are verified by default
        const defaultVerificationToken = null; // No token needed if verified

        if (role === 'student') {
            tableName = 'students';
            insertQuery = `INSERT INTO students (first_name, last_name, email, password_hash, student_id, is_verified, verification_token) 
                           VALUES (?, ?, ?, ?, ?, ?, ?)`;
            queryParams = [firstName, lastName, email, passwordHash, studentId, defaultIsVerified, defaultVerificationToken];
        } else { // role === 'teacher'
            tableName = 'teachers';
            insertQuery = `INSERT INTO teachers (first_name, last_name, email, password_hash, is_verified, verification_token) 
                           VALUES (?, ?, ?, ?, ?, ?)`;
            queryParams = [firstName, lastName, email, passwordHash, defaultIsVerified, defaultVerificationToken];
        }

        const [result] = await connection.query(insertQuery, queryParams);
        const newUserId = result.insertId;

        // Prepare details for logging
        let createLogDetails = { email: email };
        if (role === 'student') {
             createLogDetails.student_id = studentId;
        }
        await logAdminAction(connection, adminId, 'USER_CREATE', role, newUserId, createLogDetails);

        await connection.commit();
        res.status(201).json({ 
            success: true, 
            message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully.`, 
            userId: newUserId 
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error creating new user:`, error);
        // Check for specific DB errors like duplicate entry if the initial check somehow missed it
        if (error.code === 'ER_DUP_ENTRY') {
            // Determine if it was email or student_id based on error message parsing (can be fragile)
            if (error.message.includes('email')) {
                 return res.status(409).json({ success: false, message: "Email address already in use." });
            } else if (error.message.includes('student_id')) {
                 return res.status(409).json({ success: false, message: "Student ID already exists." });
            }
            return res.status(409).json({ success: false, message: "Duplicate entry error." });
        }
        res.status(500).json({ success: false, message: "Failed to create user." });
    } finally {
        if (connection) connection.release();
    }
});

// --- Class Management Routes ---

// GET /admin/classes - Fetch all classes
router.get('/classes', async (req, res) => {
    const adminId = req.user.id;
    const { searchTerm, teacherId } = req.query;

    try {
        let query = `
            SELECT 
                cr.id, cr.class_name, cr.subject, cr.description, 
                cr.teacher_id, CONCAT(t.first_name, ' ', t.last_name) as teacher_name, 
                cr.is_active, cr.created_at
            FROM class_records cr 
            LEFT JOIN teachers t ON cr.teacher_id = t.id 
        `;
        
        const conditions = [];
        const params = [];

        // Default filter: Show only active classes unless searching?
        // For now, let's keep it simple and show all, matching previous behavior.
        // conditions.push("cr.is_active = TRUE");

        if (searchTerm) {
            // Search by class name, subject, OR teacher ID
            conditions.push(`(cr.class_name LIKE ? OR cr.subject LIKE ? OR cr.teacher_id LIKE ?)`);
            const searchTermLike = `%${searchTerm}%`;
            params.push(searchTermLike, searchTermLike, searchTermLike); // Add param 3 times
        }

        if (teacherId) {
            // Handle cases where teacherId might be "" or null from the filter
            if (teacherId === 'null' || teacherId === '') {
                conditions.push(`cr.teacher_id IS NULL`);
            } else {
                conditions.push(`cr.teacher_id = ?`);
                params.push(parseInt(teacherId)); 
            }
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY cr.class_name, cr.created_at DESC`;

        const [classes] = await db.query(query, params);
        res.json({ success: true, classes });

    } catch (error) {
        console.error("Admin: Error fetching classes:", error);
        res.status(500).json({ success: false, message: "Failed to fetch class list." });
    }
});

// GET /admin/classes/:id - Fetch details for a specific class
router.get('/classes/:id', async (req, res) => {
    const classId = req.params.id;
    try {
        const [classes] = await db.query(
             `SELECT 
                cr.id, cr.class_name, cr.subject, cr.description, 
                cr.teacher_id, CONCAT(t.first_name, ' ', t.last_name) as teacher_name, 
                cr.is_active, cr.created_at
            FROM class_records cr 
            LEFT JOIN teachers t ON cr.teacher_id = t.id 
            WHERE cr.id = ?`, 
            [classId]
        );

        if (classes.length > 0) {
            res.json({ success: true, class: classes[0] });
        } else {
            res.status(404).json({ success: false, message: "Class not found." });
        }
    } catch (error) {
        console.error(`Admin: Error fetching class ${classId}:`, error);
        res.status(500).json({ success: false, message: "Failed to fetch class details." });
    }
});

// PUT /admin/classes/:id - Update class details
router.put('/classes/:id', async (req, res) => {
    const classIdToUpdate = req.params.id;
    const adminId = req.user.id;
    const { class_name, subject, description, teacher_id } = req.body;

    // --- Basic Validation --- 
    if (!class_name) {
        return res.status(400).json({ success: false, message: "Class Name is required." });
    }
    // Optional: Validate teacher_id if provided (e.g., check if it exists in teachers table)
    // For simplicity, we'll allow null or a potentially invalid ID for now.
    const teacherIdValue = teacher_id ? parseInt(teacher_id) : null;

    try {
        // Check if class exists before updating
        const [existingClass] = await db.query("SELECT id FROM class_records WHERE id = ?", [classIdToUpdate]);
        if (existingClass.length === 0) {
            return res.status(404).json({ success: false, message: "Class not found to update." });
        }

        // Execute Update
        const updateQuery = `
            UPDATE class_records 
            SET class_name = ?, subject = ?, description = ?, teacher_id = ?
            WHERE id = ?
        `;
        const [result] = await db.query(updateQuery, [
            class_name,
            subject || null, // Use null if subject is empty/not provided
            description || null, // Use null if description is empty
            teacherIdValue, // Use the parsed integer or null
            classIdToUpdate
        ]);

        if (result.affectedRows > 0) {
            // Log the action (using db pool)
            await logAdminAction(db, adminId, 'CLASS_UPDATE', 'class', classIdToUpdate, { class_name: class_name, updatedFields: Object.keys(req.body) });

            res.json({ success: true, message: "Class updated successfully." });
        } else {
             // Should only happen if the ID was valid but the update failed for some reason
            console.warn(`Admin Update Class: Update for ${classIdToUpdate} affected 0 rows.`);
            res.status(500).json({ success: false, message: "Class found but update failed unexpectedly." });
        }

    } catch (error) {
        console.error(`Admin: Error updating class ${classIdToUpdate}:`, error);
        // Check for specific errors like foreign key constraint if validating teacher_id
        res.status(500).json({ success: false, message: "Failed to update class details." });
    }
});

// DELETE /admin/classes/:id - Delete a class
router.delete('/classes/:id', async (req, res) => {
    const classIdToDelete = req.params.id;
    const adminId = req.user.id;

    try {
        // Check if class exists before deleting (optional but good practice)
        const [existingClass] = await db.query("SELECT id FROM class_records WHERE id = ?", [classIdToDelete]);
        if (existingClass.length === 0) {
            return res.status(404).json({ success: false, message: "Class not found to delete." });
        }

        // --- Get class details BEFORE deleting for audit log --- 
        let classDetailsForLog = null;
        const [classDetailsResult] = await db.query(
            "SELECT class_name, subject, teacher_id FROM class_records WHERE id = ?", 
            [classIdToDelete]
        );
        if (classDetailsResult.length > 0) {
            classDetailsForLog = classDetailsResult[0];
        }
        // --- End Get class details ---

        // Execute DELETE query
        const deleteQuery = "DELETE FROM class_records WHERE id = ?";
        const [result] = await db.query(deleteQuery, [classIdToDelete]);

        if (result.affectedRows > 0) {
            // Log the action (using db pool)
            await logAdminAction(db, adminId, 'CLASS_DELETE', 'class', classIdToDelete, classDetailsForLog);

            res.json({ success: true, message: "Class deleted successfully." });
        } else {
            // Should only happen if the ID was valid but delete failed
            console.warn(`Admin Delete Class: Delete for ${classIdToDelete} affected 0 rows.`);
            res.status(500).json({ success: false, message: "Class found but deletion failed unexpectedly." });
        }

    } catch (error) {
        console.error(`Admin: Error deleting class ${classIdToDelete}:`, error);
        // Check for specific errors, e.g., foreign key constraints if attendance records prevent deletion without ON DELETE CASCADE/SET NULL
        if (error.code === 'ER_ROW_IS_REFERENCED_2') { // Example error code
             return res.status(400).json({ success: false, message: "Cannot delete class because it has related attendance records. Please delete attendance first or contact support." });
        }
        res.status(500).json({ success: false, message: "Failed to delete class." });
    }
});

// POST /admin/classes - Create a new class
router.post('/classes', async (req, res) => {
    const adminId = req.user.id;
    const {
        class_name, 
        subject, 
        description, 
        teacher_id // Optional teacher assignment
    } = req.body;

    // --- Basic Validation --- 
    if (!class_name) {
        return res.status(400).json({ success: false, message: "Class Name is required." });
    }
    // Optional: Validate teacher_id exists if provided (can add later if needed)
    const teacherIdValue = teacher_id ? parseInt(teacher_id) : null; // Ensure null if empty/not provided

    try {
        // --- Insert into class_records table --- 
        const insertQuery = `
            INSERT INTO class_records (class_name, subject, description, teacher_id, is_active) 
            VALUES (?, ?, ?, ?, TRUE)
        `; // Assume new classes are active by default
        const queryParams = [
            class_name,
            subject || null,
            description || null,
            teacherIdValue
        ];

        const [result] = await db.query(insertQuery, queryParams);
        const newClassId = result.insertId;

        // Log the action (using db pool)
        await logAdminAction(db, adminId, 'CLASS_CREATE', 'class', newClassId, { class_name: class_name, teacher_id: teacherIdValue });

        res.status(201).json({ 
            success: true, 
            message: 'Class created successfully.', 
            classId: newClassId 
        });

    } catch (error) {
        console.error(`Admin: Error creating new class:`, error);
        // Check for specific DB errors like foreign key constraint if teacher_id validation is added
        res.status(500).json({ success: false, message: "Failed to create class." });
    }
    // No need for transaction/connection pool handling here unless validating teacher_id requires it.
});

// --- Other Admin Routes (e.g., Stats, Settings) ---

// GET /admin/stats - Fetch dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        // Fetch counts concurrently for efficiency
        const [studentCountResult] = await db.query("SELECT COUNT(*) as count FROM students");
        const [teacherCountResult] = await db.query("SELECT COUNT(*) as count FROM teachers");
        const [classCountResult] = await db.query("SELECT COUNT(*) as count FROM class_records WHERE is_active = TRUE"); // Count only active classes

        const studentCount = studentCountResult[0].count || 0;
        const teacherCount = teacherCountResult[0].count || 0;
        const classCount = classCountResult[0].count || 0;
        const totalUserCount = studentCount + teacherCount;

        res.json({
            success: true,
            stats: {
                totalUsers: totalUserCount,
                totalStudents: studentCount,
                totalTeachers: teacherCount,
                totalClasses: classCount
            }
        });

    } catch (error) {
        console.error("Admin: Error fetching dashboard stats:", error);
        res.status(500).json({ success: false, message: "Failed to fetch dashboard statistics." });
    }
});

// ================== QR SESSION HISTORY ==================

// GET /api/auth/admin/qr-sessions - Fetch QR Session History with filtering and pagination
router.get('/qr-sessions', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const { search, teacherId, subject, startDate, endDate, status } = req.query;

    let queryBase = `
        FROM qr_sessions qs
        JOIN teachers t ON qs.teacher_id = t.id
    `;
    let countQueryBase = `
        SELECT COUNT(DISTINCT qs.id) as total
        FROM qr_sessions qs
        JOIN teachers t ON qs.teacher_id = t.id
    `;
    let whereClauses = ['1 = 1']; // Start with a dummy clause
    let queryParams = [];
    let countQueryParams = [];

    // --- Filtering ---
    if (search) {
        whereClauses.push('(qs.session_id LIKE ? OR qs.subject LIKE ? OR t.first_name LIKE ? OR t.last_name LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        countQueryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
     if (teacherId && teacherId !== 'all') {
        whereClauses.push('qs.teacher_id = ?');
        queryParams.push(teacherId);
        countQueryParams.push(teacherId);
    }
    if (subject) {
        whereClauses.push('qs.subject LIKE ?');
         queryParams.push(`%${subject}%`);
         countQueryParams.push(`%${subject}%`);
    }
    if (startDate) {
        whereClauses.push('qs.created_at >= ?');
         // Assume startDate is YYYY-MM-DD, append time for comparison
        queryParams.push(`${startDate} 00:00:00`);
        countQueryParams.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
        whereClauses.push('qs.created_at <= ?');
         // Assume endDate is YYYY-MM-DD, append time for comparison
        queryParams.push(`${endDate} 23:59:59`);
        countQueryParams.push(`${endDate} 23:59:59`);
    }
     if (status) {
        const now = new Date();
        if (status === 'active') {
            whereClauses.push('qs.expires_at > ? AND qs.is_active = 1');
            queryParams.push(now);
            countQueryParams.push(now);
        } else if (status === 'expired') {
            whereClauses.push('(qs.expires_at <= ? OR qs.is_active = 0)');
            queryParams.push(now);
            countQueryParams.push(now);
        }
    }


    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const dataQuery = `
        SELECT
            qs.id as qr_session_db_id,
            qs.session_id,
            qs.teacher_id,
            t.first_name as teacher_first_name,
            t.last_name as teacher_last_name,
            qs.subject,
            qs.created_at,
            qs.expires_at,
            qs.is_active
        ${queryBase}
        ${whereString}
        ORDER BY qs.created_at DESC
        LIMIT ? OFFSET ?;
    `;
    const countQuery = `${countQueryBase} ${whereString};`;

     queryParams.push(limit, offset); // Add pagination params only to data query


    try {
        const [results] = await db.query(dataQuery, queryParams);
        const [[countResult]] = await db.query(countQuery, countQueryParams);
        const totalItems = countResult.total;
        const totalPages = Math.ceil(totalItems / limit);

        // Determine status based on expires_at and is_active
        const now = new Date();
        const sessions = results.map(session => ({
            ...session,
            status: session.is_active && new Date(session.expires_at) > now ? 'Active' : 'Expired/Inactive'
        }));


        res.json({
            sessions,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching QR session history:', error);
        res.status(500).json({ message: 'Error fetching session history', error: error.message });
    }
});

// GET /api/auth/admin/qr-sessions/:sessionId/attendees - Fetch attendees for a specific QR session
router.get('/qr-sessions/:sessionId/attendees', async (req, res) => {
    const { sessionId } = req.params;
    const adminId = req.user.id;

    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'Missing session ID.' });
    }

    try {
        const query = `
            SELECT
                a.id as attendance_id,
                a.student_id,
                s.first_name as student_first_name,
                s.last_name as student_last_name,
                s.student_id as student_reg_id, /* Student registration ID */
                a.recorded_at
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.session_id = ?
            ORDER BY a.recorded_at ASC; /* Order by scan time */
        `;

        const [attendees] = await db.query(query, [sessionId]);

        res.json({ success: true, attendees });

    } catch (error) {
        console.error(`Error fetching attendees for session ${sessionId}:`, error);
        res.status(500).json({ success: false, message: 'Error fetching attendees', error: error.message });
    }
});

// --- Audit Log Route ---

// GET /admin/audit-log - Fetch admin action audit log with filtering and pagination
router.get('/audit-log', async (req, res) => {
    const currentAdminId = req.user.id; // Admin requesting the log
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Default to 20 entries per page
    const offset = (page - 1) * limit;

    // Extract filters from query string
    const {
        adminId: filterAdminId, // ID of admin *who performed the action*
        actionType: filterActionType,
        targetType: filterTargetType,
        targetId: filterTargetId,
        startDate: filterStartDate,
        endDate: filterEndDate
    } = req.query;

    let baseQuery = `
        FROM admin_audit_log al
        LEFT JOIN admins adm ON al.admin_id = adm.id
    `;
    let countQueryBase = `SELECT COUNT(*) as total ${baseQuery}`;
    let dataQueryBase = `
        SELECT
            al.id, al.admin_id, al.action_type, al.target_type, al.target_id,
            al.details, al.timestamp,
            adm.email as admin_email,
            adm.first_name as admin_first_name,
            adm.last_name as admin_last_name
        ${baseQuery}
    `;

    let whereClauses = [];
    let queryParams = [];
    let countQueryParams = [];

    // --- Build Filter Conditions ---
    if (filterAdminId) {
        whereClauses.push('al.admin_id = ?');
        queryParams.push(filterAdminId);
        countQueryParams.push(filterAdminId);
    }
    if (filterActionType) {
        whereClauses.push('al.action_type LIKE ?'); // Use LIKE for flexibility? Or exact = ?
        queryParams.push(`%${filterActionType}%`);
        countQueryParams.push(`%${filterActionType}%`);
    }
    if (filterTargetType) {
        whereClauses.push('al.target_type = ?');
        queryParams.push(filterTargetType);
        countQueryParams.push(filterTargetType);
    }
    if (filterTargetId) {
        whereClauses.push('al.target_id = ?');
        queryParams.push(filterTargetId);
        countQueryParams.push(filterTargetId);
    }
    if (filterStartDate) {
        whereClauses.push('al.timestamp >= ?');
        queryParams.push(`${filterStartDate} 00:00:00`); // Assume YYYY-MM-DD format
        countQueryParams.push(`${filterStartDate} 00:00:00`);
    }
    if (filterEndDate) {
        whereClauses.push('al.timestamp <= ?');
        queryParams.push(`${filterEndDate} 23:59:59`); // Assume YYYY-MM-DD format
        countQueryParams.push(`${filterEndDate} 23:59:59`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // --- Construct Final Queries ---
    const countQuery = `${countQueryBase} ${whereString}`;
    const dataQuery = `
        ${dataQueryBase}
        ${whereString}
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
    `;

    // Add pagination params ONLY to the data query
    queryParams.push(limit, offset);

    try {
        // Execute queries concurrently
        const [[countResult], [logs]] = await Promise.all([
            db.query(countQuery, countQueryParams),
            db.query(dataQuery, queryParams)
        ]);

        const totalItems = countResult.total || 0;
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            logs: logs.map(log => ({ // Format admin name nicely
                ...log,
                admin_name: log.admin_first_name || log.admin_last_name ? `${log.admin_first_name || ''} ${log.admin_last_name || ''}`.trim() : log.admin_email // Fallback to email if name is missing
            })),
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                limit
            }
        });

    } catch (error) {
        console.error("Admin: Error fetching audit log:", error);
        res.status(500).json({ success: false, message: "Failed to fetch audit log." });
    }
});

// GET /admin/admins - Fetch all admin users (for audit log filter, etc.)
router.get('/admins', async (req, res) => {
    try {
        const [admins] = await db.query(
            // Select necessary fields from the admins table
            "SELECT id, first_name, last_name, email, created_at FROM admins ORDER BY last_name, first_name, email"
        );
        res.json({ success: true, admins }); // Return admins in an 'admins' property
    } catch (error) {
        console.error("Admin: Error fetching admins list:", error);
        res.status(500).json({ success: false, message: "Failed to fetch admins list." });
    }
});

// GET /admins/:id - Fetch details for a specific admin
router.get('/admins/:id', async (req, res) => {
    const adminIdToFetch = req.params.id;
    const requestingAdminId = req.user.id;
    // You might allow fetching self, or restrict further if needed
    // console.log(`Admin ${requestingAdminId} fetching details for admin ${adminIdToFetch}.`);

    try {
        const [admins] = await db.query(
            "SELECT id, email, first_name, last_name, role, created_at FROM admins WHERE id = ?",
            [adminIdToFetch]
        );

        if (admins.length > 0) {
            res.json({ success: true, admin: admins[0] });
        } else {
            res.status(404).json({ success: false, message: "Admin user not found." });
        }
    } catch (error) {
        console.error(`Admin: Error fetching admin ${adminIdToFetch}:`, error);
        res.status(500).json({ success: false, message: "Failed to fetch admin details." });
    }
});

// POST /admins - Create a new admin user
router.post('/admins', async (req, res) => {
    const requestingAdminId = req.user.id;
    const { firstName, lastName, email, password } = req.body;

    // Basic Validation
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ success: false, message: "Missing required fields (firstName, lastName, email, password)." });
    }
    // Add password complexity checks if desired

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if email already exists in ANY user table (optional, but good practice)
        const [existingAdmin] = await connection.query("SELECT id FROM admins WHERE email = ?", [email]);
        const [existingTeacher] = await connection.query("SELECT id FROM teachers WHERE email = ?", [email]);
        const [existingStudent] = await connection.query("SELECT id FROM students WHERE email = ?", [email]);

        if (existingAdmin.length > 0 || existingTeacher.length > 0 || existingStudent.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Email address already in use." });
        }

        // Hash Password
        const saltRounds = 10; // Make sure this matches login logic
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new admin
        const insertQuery = `INSERT INTO admins (first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`;
        const [result] = await connection.query(insertQuery, [firstName, lastName, email, passwordHash]);
        const newAdminId = result.insertId;

        // Log the action
        const logDetails = { email: email, firstName: firstName, lastName: lastName };
        await logAdminAction(connection, requestingAdminId, 'ADMIN_CREATE', 'admin', newAdminId, logDetails);

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Admin user created successfully.',
            adminId: newAdminId
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error creating new admin:`, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: "Email address already in use." });
        }
        res.status(500).json({ success: false, message: "Failed to create admin user." });
    } finally {
        if (connection) connection.release();
    }
});

// PUT /admins/:id - Update admin details (excluding password)
router.put('/admins/:id', async (req, res) => {
    const adminIdToUpdate = req.params.id;
    const requestingAdminId = req.user.id;
    const { firstName, lastName, email } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email) {
        return res.status(400).json({ success: false, message: "Missing required fields (firstName, lastName, email)." });
    }
    // Cannot change role via this endpoint

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if admin exists
        const [adminExists] = await connection.query("SELECT id FROM admins WHERE id = ?", [adminIdToUpdate]);
        if (adminExists.length === 0) {
             await connection.rollback();
            return res.status(404).json({ success: false, message: "Admin user not found to update." });
        }

        // Check if email is being changed and if the new email is already taken by ANOTHER user
        const [currentAdmin] = await connection.query("SELECT email FROM admins WHERE id = ?", [adminIdToUpdate]);
        if (email !== currentAdmin[0].email) {
            const [existingAdmin] = await connection.query("SELECT id FROM admins WHERE email = ? AND id != ?", [email, adminIdToUpdate]);
            const [existingTeacher] = await connection.query("SELECT id FROM teachers WHERE email = ?", [email]);
            const [existingStudent] = await connection.query("SELECT id FROM students WHERE email = ?", [email]);
            if (existingAdmin.length > 0 || existingTeacher.length > 0 || existingStudent.length > 0) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: "New email address is already in use." });
            }
        }

        // Update admin details
        const updateQuery = "UPDATE admins SET first_name = ?, last_name = ?, email = ? WHERE id = ?";
        const [result] = await connection.query(updateQuery, [firstName, lastName, email, adminIdToUpdate]);

        // Log the action
        const logDetails = { updatedFields: ['firstName', 'lastName', 'email'], newEmail: email }; // Example details
        await logAdminAction(connection, requestingAdminId, 'ADMIN_UPDATE', 'admin', adminIdToUpdate, logDetails);

        await connection.commit();

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Admin details updated successfully." });
        } else {
            // Should not happen if exists check passed, but handle defensively
             await connection.rollback(); // Rollback just in case
            res.status(404).json({ success: false, message: "Admin user found but update failed." });
        }

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error updating admin ${adminIdToUpdate}:`, error);
         if (error.code === 'ER_DUP_ENTRY') { // Should be caught above, but as fallback
            return res.status(409).json({ success: false, message: "Email address already in use." });
        }
        res.status(500).json({ success: false, message: "Failed to update admin details." });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /admins/:id - Delete an admin user
router.delete('/admins/:id', async (req, res) => {
    const adminIdToDelete = req.params.id;
    const requestingAdminId = req.user.id;

    // IMPORTANT: Prevent self-deletion
    if (String(adminIdToDelete) === String(requestingAdminId)) {
        return res.status(403).json({ success: false, message: "Cannot delete your own admin account." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get details before deleting for audit log
        let adminDetailsForLog = null;
        const [adminDetails] = await connection.query(
            "SELECT email, first_name, last_name FROM admins WHERE id = ?",
            [adminIdToDelete]
        );
        if (adminDetails.length === 0) {
             await connection.rollback();
            return res.status(404).json({ success: false, message: "Admin user not found to delete." });
        }
        adminDetailsForLog = adminDetails[0];

        // Execute DELETE query
        const deleteQuery = `DELETE FROM admins WHERE id = ?`;
        const [result] = await connection.query(deleteQuery, [adminIdToDelete]);

        if (result.affectedRows === 0) {
            // User existed but wasn't deleted (shouldn't normally happen here)
            await connection.rollback();
            return res.status(500).json({ success: false, message: "Admin found but deletion failed unexpectedly." });
        }

        // Commit transaction before logging
        await connection.commit();

        // Log action AFTER commit using main pool
        // Note: Audit log FK constraint is ON DELETE SET NULL, so admin_id will become NULL here
        await logAdminAction(db, requestingAdminId, 'ADMIN_DELETE', 'admin', adminIdToDelete, adminDetailsForLog);

        res.json({ success: true, message: `Admin user deleted successfully.` });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Admin: Error deleting admin ${adminIdToDelete}:`, error);
        // Check for specific errors if needed (e.g., foreign key issues if not handled by DB)
        res.status(500).json({ success: false, message: "Failed to delete admin user." });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router; // Ensure module is exported at the end
