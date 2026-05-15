const express = require('express');
const router = express.Router();
const db = require('../db'); // Adjust the path if your db setup is different
// const { authenticateToken } = require('../middleware/auth'); // Assuming middleware for auth

// Middleware to check if user is authenticated (example)
// Replace this with your actual authentication middleware if it differs
const authenticateToken = (req, res, next) => {
    // Primary check: Session-based authentication
    if (req.session && req.session.userId && req.session.userRole === 'teacher') {
        console.log(`[Auth Middleware - dashboard.js] Access Granted via Session: Teacher ID ${req.session.userId}`);
        // Ensure req.userId is consistent if session exists
        req.userId = req.session.userId; 
        return next(); // User is authenticated via session
    }

    // Fallback check: Header-based authentication
    const userIdFromHeader = req.headers['x-user-id'];
    const userRoleFromHeader = req.headers['x-user-role'];

    if (userIdFromHeader && userRoleFromHeader === 'teacher') {
        console.log(`[Auth Middleware - dashboard.js] Access Granted via Headers: Teacher ID ${userIdFromHeader}`);
        // Attach userId to the request object for the route handler to use
        req.userId = userIdFromHeader; 
        return next(); // User is authenticated via headers
    }

    // If both checks fail
    console.warn(`[Auth Middleware - dashboard.js] Access Denied. Session data:`, req.session, `Headers: ID=${userIdFromHeader}, Role=${userRoleFromHeader}`);
    res.status(401).json({ success: false, message: 'Unauthorized: Access Denied.' });
};

// Route to get teacher dashboard statistics
router.get('/teacher-stats', authenticateToken, async (req, res) => {
    // Use req.userId which is set by authenticateToken from either session or header
    const teacherId = req.userId; 

    if (!teacherId) {
        // This should ideally be caught by authenticateToken, but added as a safeguard
        console.error('[Stats Route] Critical Error: authenticateToken passed but req.userId is missing.');
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID missing after authentication.' });
    }

    try {
        // Get Total Sessions count from qr_sessions table
        // FIXED: Use 'qr_sessions' table and 'teacher_id' column
        const [sessionsResult] = await db.query(
            'SELECT COUNT(DISTINCT session_id) as totalSessions FROM qr_sessions WHERE teacher_id = ?', // Use qr_sessions and teacher_id
            [teacherId]
        );
        const totalSessions = sessionsResult[0]?.totalSessions || 0;

        // Get Total Unique Attendees across all QR sessions for this teacher
        const [attendeesResult] = await db.query(
            `SELECT COUNT(a.id) as totalAttendees 
             FROM attendance a 
             JOIN qr_sessions s ON a.session_id = s.session_id 
             WHERE s.teacher_id = ?`,
            [teacherId]
        );
        const totalAttendees = attendeesResult[0]?.totalAttendees || 0;

        // RE-ADD: Get Total Classes count for this teacher
        const [classesResult] = await db.query(
            // Use class_records table and teacher_id column
            'SELECT COUNT(*) as totalClasses FROM class_records WHERE teacher_id = ? AND is_active = TRUE',
            [teacherId]
        );
        const totalClasses = classesResult[0]?.totalClasses || 0;

        // Get total attendance records count for this teacher
        const [attendanceCountResult] = await db.query(
            `SELECT COUNT(a.id) as totalAttendanceRecords
             FROM attendance a 
             JOIN qr_sessions s ON a.session_id = s.session_id 
             WHERE s.teacher_id = ?`,
            [teacherId]
        );
        const totalAttendanceRecords = attendanceCountResult[0]?.totalAttendanceRecords || 0;
        
        // Calculate average attendance
        const averageAttendance = totalSessions > 0 
            ? (totalAttendanceRecords / totalSessions).toFixed(1) // Calculate and format to 1 decimal place
            : 0; // Default to 0 if no sessions

        // --- Placeholder for Future Stats --- 
        // --- End Placeholder ---

        const stats = {
            totalSessions: totalSessions,
            totalAttendees: totalAttendees, 
            totalClasses: totalClasses, 
            averageAttendance: averageAttendance // Add average attendance
        };

        console.log(`[Stats] Fetched for Teacher ${teacherId}:`, stats);
        res.json({ success: true, stats: stats });

    } catch (error) {
        console.error(`[Stats] Error fetching stats for Teacher ${teacherId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch teacher statistics.' });
    }
});

module.exports = router;
