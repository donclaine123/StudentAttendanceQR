const express = require('express');
const router = express.Router();
const db = require('../db'); // Adjust path if needed

// --- Authentication Middleware (New Logic - Direct DB Check) --- 
// This middleware verifies a user is logged in by checking the session cookie against the DB.
const authenticateAndAttachUser = async (req, res, next) => {
    const sessionId = req.cookies.qr_attendance_sid;
    console.log('--- Authenticate Middleware (Direct DB Check) --- START ---');
    console.log('Cookies:', req.cookies);
    console.log('Session ID from Cookie:', sessionId);

    // 1. Check for Session Cookie
    if (sessionId) {
        try {
            console.log(`DEBUG: Found session cookie ${sessionId.substring(0,8)}, querying DB...`);
            const [sessions] = await db.query(
                `SELECT user_id, role 
                 FROM sessions 
                 WHERE session_id = ? AND expires_at > NOW() AND is_active = TRUE`,
                [sessionId]
            );

            if (sessions.length > 0) {
                const { user_id, role } = sessions[0];
                console.log(`DEBUG: Valid session found in DB for SID ${sessionId.substring(0,8)}. UserID: ${user_id}, Role: ${role}`);
                req.userId = user_id; // Attach user info directly to req
                req.userRole = role;
                // Optionally touch the session in the database to update last_activity/expires_at if rolling session is desired
                // await db.query('UPDATE sessions SET last_activity = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE session_id = ?', [sessionId]);
                return next(); // Authentication successful
            } else {
                console.log(`DEBUG: Session cookie ${sessionId.substring(0,8)} found, but no valid/active session in DB.`);
                 // Clear the invalid cookie
                res.clearCookie('qr_attendance_sid', { path: '/', httpOnly: true, secure: true, sameSite: 'none' });
                // Fall through to check headers
            }
        } catch (dbError) {
            console.error('DEBUG: Database error during session check:', dbError);
            return res.status(500).json({ success: false, message: 'Database error during authentication.' });
        }
    } else {
        console.log('DEBUG: No session cookie found.');
        // No session cookie, fall through to check headers
    }

    // 2. Fallback: Check Headers
    console.log('DEBUG: Checking for fallback header authentication...');
    const userIdFromHeader = req.headers['x-user-id'];
    const userRoleFromHeader = req.headers['x-user-role'];

    if (userIdFromHeader && (userRoleFromHeader === 'student' || userRoleFromHeader === 'teacher')) {
        console.log(`DEBUG: Using fallback header auth (ID: ${userIdFromHeader}, Role: ${userRoleFromHeader})`);
        req.userId = parseInt(userIdFromHeader, 10); // Ensure ID is a number
        req.userRole = userRoleFromHeader;
        return next(); // Authentication successful via headers
    }

    // 3. If neither method worked
    console.warn(`[Profile Auth] Access Denied. No valid session cookie/DB record or auth headers found.`);
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in.' });
};

// --- Student Profile Routes --- 

// GET /profile - Fetch student profile data
router.get('/profile', authenticateAndAttachUser, async (req, res) => {
    // Ensure the authenticated user is a student
    if (req.userRole !== 'student') {
        return res.status(403).json({ success: false, message: 'Forbidden: Access restricted to students.' });
    }
    
    const studentId = req.userId;

    try {
        // Fetch student details including student_id from the dedicated students table
        const [students] = await db.query(
            'SELECT id, student_id, email, first_name, last_name FROM students WHERE id = ?',
            [studentId]
        );

        if (students.length > 0) {
            const student = students[0];
            res.json({ 
                success: true, 
                user: { // Keep response structure consistent 
                    id: student.id, 
                    student_id: student.student_id, // Use the field name from the students table
                    email: student.email, 
                    first_name: student.first_name, 
                    last_name: student.last_name 
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'Student profile not found.' });
        }
    } catch (error) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ success: false, message: 'Database error fetching student profile.' });
    }
});

// PUT /profile - Update student profile data
router.put('/profile', authenticateAndAttachUser, async (req, res) => {
    // Ensure the authenticated user is a student
    if (req.userRole !== 'student') {
        return res.status(403).json({ success: false, message: 'Forbidden: Access restricted to students.' });
    }

    const studentId = req.userId;
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName || firstName.trim() === '' || lastName.trim() === '') {
        return res.status(400).json({ success: false, message: 'First name and last name cannot be empty.' });
    }

    try {
        // Update the dedicated students table
        const [result] = await db.query(
            'UPDATE students SET first_name = ?, last_name = ? WHERE id = ?',
            [firstName.trim(), lastName.trim(), studentId]
        );

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Profile updated successfully.' });
        } else {
            res.status(404).json({ success: false, message: 'Student profile not found or no changes made.' });
        }
    } catch (error) {
        console.error('Error updating student profile:', error);
        res.status(500).json({ success: false, message: 'Database error updating student profile.' });
    }
});

// --- Teacher Profile Routes --- 

// GET /teacher/profile - Fetch teacher profile data
router.get('/teacher/profile', authenticateAndAttachUser, async (req, res) => {
    // Ensure the authenticated user is a teacher
    if (req.userRole !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Forbidden: Access restricted to teachers.' });
    }

    const teacherId = req.userId; 

    try {
        // Query the dedicated teachers table
        const [teachers] = await db.query(
            'SELECT id, email, first_name, last_name FROM teachers WHERE id = ?',
            [teacherId] // Role check is implicitly handled by finding the ID in the teachers table
        );

        if (teachers.length > 0) {
            const teacher = teachers[0];
            res.json({ 
                success: true, 
                user: { // Keep the response structure consistent
                    id: teacher.id, 
                    email: teacher.email, 
                    first_name: teacher.first_name, 
                    last_name: teacher.last_name 
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'Teacher profile not found.' });
        }
    } catch (error) {
        console.error('Error fetching teacher profile:', error);
        res.status(500).json({ success: false, message: 'Database error fetching teacher profile.' });
    }
});

// PUT /teacher/profile - Update teacher profile data
router.put('/teacher/profile', authenticateAndAttachUser, async (req, res) => {
     // Ensure the authenticated user is a teacher
    if (req.userRole !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Forbidden: Access restricted to teachers.' });
    }
    
    const teacherId = req.userId;
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName || firstName.trim() === '' || lastName.trim() === '') {
        return res.status(400).json({ success: false, message: 'First name and last name cannot be empty.' });
    }

    try {
        // Update the dedicated teachers table
        const [result] = await db.query(
            'UPDATE teachers SET first_name = ?, last_name = ? WHERE id = ?',
            [firstName.trim(), lastName.trim(), teacherId] // Role check is implicitly handled by updating the teachers table
        );

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Profile updated successfully.' });
        } else {
            // This might happen if the ID doesn't match a teacher role, though auth should prevent it
            res.status(404).json({ success: false, message: 'Teacher profile not found or no changes made.' });
        }
    } catch (error) {
        console.error('Error updating teacher profile:', error);
        res.status(500).json({ success: false, message: 'Database error updating profile.' });
    }
});

module.exports = router; 