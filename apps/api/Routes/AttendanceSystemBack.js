const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('./authMiddleware');
const { Parser } = require('json2csv');


// Handle QR code attendance links
router.get('/attend', async (req, res) => {
  const { session, teacher } = req.query;
  
  if (!session || !teacher) {
    return res.status(400).send(`
      <html>
        <head>
          <title>Invalid QR Code</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; }
            .error-container { max-width: 500px; margin: 0 auto; }
            h1 { color: #e74c3c; }
            p { color: #333; line-height: 1.6; }
            .btn { display: inline-block; background: #3498db; color: white; padding: 10px 20px; 
                  text-decoration: none; border-radius: 4px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Invalid QR Code</h1>
            <p>The QR code is missing required information. Please ask your teacher for a valid QR code.</p>
            <a href="/" class="btn">Go to Login</a>
          </div>
        </body>
      </html>
    `);
  }

  try {
    
    // Check if session exists and is valid using MySQL syntax
    const sessionCheckQuery = `
      SELECT qs.session_id, qs.class_id, qs.expires_at, cr.class_name 
      FROM qr_sessions qs
      LEFT JOIN class_records cr ON qs.class_id = cr.id
      WHERE qs.session_id = ? AND qs.teacher_id = ? AND qs.expires_at > NOW()
    `;

    const [sessionRows] = await db.query(sessionCheckQuery, [session, teacher]);
    
    // Check if session exists
    if (!sessionRows || sessionRows.length === 0) {
      return res.status(404).send(`
        <html>
          <head>
            <title>Expired QR Code</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; }
              .error-container { max-width: 500px; margin: 0 auto; }
              h1 { color: #e74c3c; }
              p { color: #333; line-height: 1.6; }
              .btn { display: inline-block; background: #3498db; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 4px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>Expired QR Code</h1>
              <p>This QR code has expired or is invalid. Please ask your teacher for a new QR code.</p>
              <a href="/" class="btn">Go to Login</a>
            </div>
          </body>
        </html>
      `);
    }

    // Get the session data
    const sessionRow = sessionRows[0];

    // Redirect to student dashboard with params for attendance
    const subject = sessionRow.class_name || 'Class';
    const redirectUrl = `/pages/student-dashboard.html?session=${session}&teacher=${teacher}&subject=${encodeURIComponent(subject)}`;
    return res.redirect(redirectUrl);
    
  } catch (error) {
    console.error("Error handling attendance:", error);
    return res.status(500).send(`
      <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; }
            .error-container { max-width: 500px; margin: 0 auto; }
            h1 { color: #e74c3c; }
            p { color: #333; line-height: 1.6; }
            .btn { display: inline-block; background: #3498db; color: white; padding: 10px 20px; 
                  text-decoration: none; border-radius: 4px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Server Error</h1>
            <p>Something went wrong. Please try again later or contact support.</p>
            <a href="/" class="btn">Go to Login</a>
          </div>
        </body>
      </html>
    `);
  }
});

// POST route to record attendance
router.post("/record-attendance", authenticate, async (req, res) => {
  try {
    const { session_id } = req.body;
    const studentId = req.user.id;
    
    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required"
      });
    }
    
    // Verify the session exists and is active
    const [sessionCheck] = await db.query(
      `SELECT teacher_id, subject, is_active FROM qr_sessions 
       WHERE session_id = ? OR id = ? AND expires_at > NOW()`,
      [session_id, session_id]
    );
    
    if (sessionCheck.length === 0 || !sessionCheck[0].is_active) {
      return res.status(400).json({
        success: false,
        message: "This QR code has expired or is no longer valid"
      });
    }
    
    const teacherId = sessionCheck[0].teacher_id;
    const subject = sessionCheck[0].subject;
    
    // Check if attendance already recorded
    const [existingAttendance] = await db.query(
      `SELECT id FROM attendance 
       WHERE session_id = ? AND student_id = ?`,
      [session_id, studentId]
    );
    
    const attendanceExists = existingAttendance.length > 0;
    
    if (attendanceExists) {
      return res.status(400).json({
        success: false,
        message: "Your attendance for this session has already been recorded"
      });
    }
    
    // Get student info for the response
    const [studentInfo] = await db.query(
      `SELECT first_name, last_name FROM students WHERE id = ?`,
      [studentId]
    );
    
    // Insert attendance record
    try {
      const [insertResult] = await db.query(
        `INSERT INTO attendance (session_id, student_id, teacher_id, subject, recorded_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [session_id, studentId, teacherId, subject]
      );
      
      // Use UTC+8 timestamp for consistency if needed elsewhere, otherwise simple now is fine
      const now = new Date();
      const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);

      return res.json({
        success: true,
        message: "Attendance recorded successfully",
        subject: subject,
        student: studentInfo[0] ? `${studentInfo[0].first_name} ${studentInfo[0].last_name}` : "Unknown Student",
        timestamp: utc8Time.toISOString()
      });
    } catch (insertError) {
      return res.status(500).json({
        success: false,
        message: "Database error while recording attendance. Please try again later."
      });
    }
    
  } catch (error) {
    console.error("Attendance recording error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while recording attendance"
    });
  }
});

// Get attendance reports for teachers
router.get('/attendance-reports', authenticate, requireRole('teacher'), async (req, res) => {
  try {
    const { session_id } = req.query;
    const teacherId = req.user.id;
    
    // Validate session belongs to teacher
    const [sessionCheck] = await db.query(
      `SELECT session_id, subject FROM qr_sessions 
       WHERE session_id = ? AND teacher_id = ?`,
      [session_id, teacherId]
    );
    
    if (sessionCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this session'
      });
    }
    
    const subject = sessionCheck[0].subject || 'Unknown Subject';
    
    // Get attendance records
    const [attendance] = await db.query(
      `SELECT 
        a.id,
        a.student_id,
        a.recorded_at as timestamp,
        a.subject,
        CONCAT(s.first_name, ' ', s.last_name) as studentName,
        s.student_id as studentNumber
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       WHERE a.session_id = ? AND a.teacher_id = ?
       ORDER BY a.recorded_at ASC`,
      [session_id, teacherId]
    );
    
    res.json({
      success: true,
      subject: subject,
      attendance,
      count: attendance.length
    });
    
  } catch (error) {
    console.error('Attendance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance reports'
    });
  }
});

// Get attendance history for a student
router.get('/student-attendance-history', authenticate, requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;
    
    // Get attendance history for the student with UTC+8 time using MySQL DATE_ADD
    const [history] = await db.query(
      `SELECT 
        a.id,
        a.session_id,
        DATE_FORMAT(DATE_ADD(a.recorded_at, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i:%s') as timestamp,
        a.teacher_id,
        CONCAT(t.first_name, ' ', t.last_name) as teacherName,
        COALESCE(a.subject, qs.subject, 'Unknown Subject') as subject,
        qs.section
       FROM attendance a
       JOIN teachers t ON a.teacher_id = t.id
       LEFT JOIN qr_sessions qs ON a.session_id = qs.session_id
       WHERE a.student_id = ?
       ORDER BY a.recorded_at DESC
       LIMIT 50`,
      [studentId]
    );
    
    // Format timestamps if needed (the MySQL DATE_FORMAT already does most of the work)
    const formattedHistory = history.map(record => {
      // Ensure we have a properly formatted timestamp
      if (record.timestamp) {
        try {
          // Convert the formatted string to a Date object for consistent ISO string output
          const date = new Date(record.timestamp);
          if (!isNaN(date.getTime())) {
          } else {
            // If we couldn't parse the MySQL formatted date, create a new UTC+8 timestamp manually
            const now = new Date();
            const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            record.timestamp = utc8Time.toISOString();
          }
        } catch (e) {
          console.error(`📚 Error processing timestamp for record ${record.id}:`, e);
        }
      } else {
        // If no timestamp, use current time
        const now = new Date();
        const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        record.timestamp = utc8Time.toISOString();
      }
      return record;
    });
    
    // If no history found, provide sample data with UTC+8 timestamp
    if (formattedHistory.length === 0) {
      // Create a sample timestamp in UTC+8
      const now = new Date();
      const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      
      res.json({
        success: true,
        history: [{
          id: 0,
          session_id: 'sample',
          timestamp: utc8Time.toISOString(),
          teacher_id: 1,
          teacherName: 'Sample Teacher',
          subject: 'Mathematics'
        }],
        count: 1,
        note: 'Sample data provided (no actual attendance records found)'
      });
      return;
    }
    
    res.json({
      success: true,
      history: formattedHistory,
      count: formattedHistory.length
    });
    
  } catch (error) {
    console.error('📚 Student attendance history error:', error);
    // Return a friendly error with sample data using UTC+8 time
    const now = new Date();
    const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    
    res.json({
      success: true,
      history: [{
        id: 0,
        session_id: 'error',
        timestamp: utc8Time.toISOString(),
        teacher_id: 1,
        teacherName: 'Error retrieving records',
        subject: 'Please try again later'
      }],
      count: 1,
      error: error.message
    });
  }
});

// Route to get student attendance count
router.get('/student-attendance-stats', authenticate, requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Query to count attendance records for the student
    const countQuery = `SELECT COUNT(*) as attendedCount FROM attendance WHERE student_id = ?`;
    const [countResult] = await db.query(countQuery, [studentId]);

    const attendedCount = countResult[0]?.attendedCount || 0;

    res.json({
      success: true,
      attendedCount: attendedCount
    });

  } catch (error) {
    console.error('📊 Error fetching student attendance stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance statistics',
      error: error.message // Include error message for debugging if needed
    });
  }
});

// Add a route to fix the attendance table schema
router.get("/fix-attendance-schema", async (req, res) => {
  try {
    console.log("🔧 Attempting to fix attendance table schema...");
    
    // Check current table structure
    const [columns] = await db.query("DESCRIBE attendance");
    console.log("Current attendance table columns:", columns.map(c => c.Field));
    
    // Check if foreign keys exist
    const [foreignKeys] = await db.query(
      "SELECT * FROM information_schema.KEY_COLUMN_USAGE " +
      "WHERE TABLE_NAME = 'attendance' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    console.log("Foreign keys:", foreignKeys);
    
    // Series of operations to fix the schema
    const operations = [];
    
    // Add qr_session_id column if it doesn't exist
    const hasQrSessionId = columns.some(c => c.Field === 'qr_session_id');
    if (!hasQrSessionId) {
      operations.push(
        db.query("ALTER TABLE attendance ADD COLUMN qr_session_id VARCHAR(64) AFTER id")
      );
    }
    
    // Update all existing records to have qr_session_id match session_id
    operations.push(
      db.query("UPDATE attendance SET qr_session_id = session_id WHERE qr_session_id IS NULL")
    );
    
    // Remove the foreign key constraint if it exists
    if (foreignKeys.length > 0) {
      const fkName = foreignKeys.find(fk => fk.COLUMN_NAME === 'session_id')?.CONSTRAINT_NAME;
      if (fkName) {
        operations.push(
          db.query(`ALTER TABLE attendance DROP FOREIGN KEY ${fkName}`)
        );
      }
    }
    
    // Add new foreign key to qr_sessions
    operations.push(
      db.query(
        "ALTER TABLE attendance " +
        "ADD CONSTRAINT attendance_qr_session_fk " +
        "FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(session_id) " +
        "ON DELETE CASCADE"
      )
    );
    
    // Execute all operations
    const results = await Promise.allSettled(operations);
    
    // Check results
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');
    
    if (failed.length > 0) {
      console.error("Some schema updates failed:", failed.map(f => f.reason));
    }
    
    // Final check
    const [updatedColumns] = await db.query("DESCRIBE attendance");
    console.log("Updated attendance table columns:", updatedColumns.map(c => c.Field));
    
    return res.json({
      success: true,
      message: `Schema update completed. ${succeeded} operations succeeded, ${failed.length} failed.`,
      details: {
        columns: updatedColumns.map(c => c.Field),
        operationsAttempted: operations.length,
        operationsSucceeded: succeeded,
        operationsFailed: failed.length
      }
    });
    
  } catch (error) {
    console.error("Schema update error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating schema",
      error: error.message
    });
  }
});

// Get attendance records for a session
router.get('/teacher/attendance/:sessionId', authenticate, async (req, res) => {
    const { sessionId } = req.params;
    const teacherId = req.user.id;
    
    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'Session ID is required' });
    }
    
    try {
        // First verify this session belongs to the teacher
        const sessionCheckQuery = `
            SELECT s.* FROM qr_sessions s
            JOIN class_records c ON s.class_id = c.id
            WHERE (s.id = ? OR s.session_id = ?) AND c.teacher_id = ?
        `;
        
        db.query(sessionCheckQuery, [sessionId, sessionId, teacherId], async (error, sessionResults) => {
            if (error) {
                console.error('Error checking session ownership:', error);
                return res.status(500).json({ success: false, message: 'Error verifying session ownership', error: error.message });
            }
            
            if (!sessionResults || sessionResults.length === 0) {
                return res.status(403).json({ success: false, message: 'Session not found or you do not have permission to view these records' });
            }
            
            // Fetch correct session details for the response header
            const sessionDetailsQuery = `
                SELECT qs.section, cr.class_name, cr.subject 
                FROM qr_sessions qs 
                JOIN class_records cr ON qs.class_id = cr.id 
                WHERE qs.session_id = ?
            `;
            const [detailsResults] = await db.query(sessionDetailsQuery, [sessionId]);
            const sessionDetails = detailsResults[0] || {}; // Use empty object if not found

            // Session belongs to teacher, now get attendance records
            const attendanceQuery = `
                SELECT 
                    a.id, 
                    a.student_id, 
                    DATE_FORMAT(CONVERT_TZ(a.recorded_at, @@session.time_zone, '+00:00'), '%b %e, %Y, %h:%i:%s %p') as timestamp, -- Format as 'May 3, 2025, 11:07:57 PM' (UTC)
                    s.student_id as student_number, 
                    CONCAT(s.first_name, ' ', s.last_name) as student_name
                FROM attendance a
                JOIN students s ON a.student_id = s.id
                WHERE a.session_id = ? 
                ORDER BY a.recorded_at ASC
            `;
            
            db.query(attendanceQuery, [sessionId], (attendanceError, attendanceResults) => {
                if (attendanceError) {
                    console.error('Error fetching attendance records:', attendanceError);
                    return res.status(500).json({ success: false, message: 'Error fetching attendance records', error: attendanceError.message });
                }
                
                // No need to map/format here anymore, timestamp is already formatted string
                const formattedRecords = attendanceResults; 
                
                // Send back the correctly fetched session details
                return res.json({
                    success: true,
                    attendanceRecords: formattedRecords,
                    className: sessionDetails.class_name, // Use fetched details
                    subject: sessionDetails.subject,     // Use fetched details
                    section: sessionDetails.section      // Use fetched details
                });
            });
        });
    } catch (error) {
        console.error('Exception in attendance endpoint:', error);
        return res.status(500).json({ success: false, message: 'Server error processing attendance request', error: error.message });
    }
});

// Get classes for a teacher
router.get("/teacher-classes/:teacherId", async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    
    // Verify authorization (either session or header-based)
    const isAuthenticated = 
      (req.session && req.session.userId && req.session.role === 'teacher' && req.session.userId == teacherId) ||
      (req.headers['x-user-id'] && req.headers['x-user-role'] === 'teacher' && req.headers['x-user-id'] == teacherId);
    
    if (!isAuthenticated) {
      console.log('Unauthorized access to teacher classes endpoint');
      console.log('Session user:', req.session?.userId, 'Session role:', req.session?.role);
      console.log('Header user:', req.headers['x-user-id'], 'Header role:', req.headers['x-user-role']);
      console.log('Requested teacher ID:', teacherId);
      
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please log in as a teacher."
      });
    }
    
    // Log the SQL query for debugging
    console.log(`Fetching classes for teacher ID: ${teacherId}`);
    
    try {
      // Query using the correct table name class_records instead of classes
      const [rows] = await db.query(
        `SELECT cr.id, cr.class_name as name, cr.description, cr.subject,
         COUNT(DISTINCT qs.id) as session_count, 
         COUNT(DISTINCT a.id) as total_attendances 
         FROM class_records cr
         LEFT JOIN qr_sessions qs ON cr.id = qs.class_id 
         LEFT JOIN attendance a ON qs.session_id = a.session_id 
         WHERE cr.teacher_id = ? AND cr.is_active = TRUE
         GROUP BY cr.id 
         ORDER BY cr.class_name ASC`,
        [teacherId]
      );
      
      console.log(`Found ${rows.length} classes for teacher ${teacherId}`);
      
      res.json({
        success: true,
        classes: rows
      });
    } catch (queryError) {
      console.error("Database query error:", queryError);
      // Fallback to a simpler query if the join is causing issues
      console.log("Trying fallback query...");
      
      const [basicRows] = await db.query(
        `SELECT id, class_name as name, description, subject
         FROM class_records 
         WHERE teacher_id = ? AND is_active = TRUE
         ORDER BY class_name ASC`,
        [teacherId]
      );
      
      console.log(`Found ${basicRows.length} classes in fallback query`);
      
      res.json({
        success: true,
        classes: basicRows,
        usedFallback: true
      });
    }
  } catch (error) {
    console.error("Error fetching teacher classes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load classes",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export attendance records as CSV for a specific session
router.get('/attendance/export', authenticate, requireRole('teacher'), async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const teacherId = req.user.id;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }
    
    // 1. Get Session and Class Info
    const [sessionInfo] = await db.query(
        `SELECT 
            qs.created_at as session_date,
            qs.section,
            cr.class_name,
            cr.subject
         FROM qr_sessions qs
         JOIN class_records cr ON qs.class_id = cr.id
         WHERE (qs.id = ? OR qs.session_id = ?) AND cr.teacher_id = ?`,
        [sessionId, sessionId, teacherId]
    );

    if (sessionInfo.length === 0) {
      return res.status(403).json({ success: false, message: 'You do not have permission to export this session' });
    }

    const { session_date, section, class_name, subject } = sessionInfo[0];

    // 2. Fetch attendance and student data
    const [records] = await db.query(
      `SELECT s.student_id, 
              CONCAT(s.first_name, ' ', s.last_name) AS student_name, 
              a.recorded_at AS check_in_time
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       WHERE a.session_id = ?
       ORDER BY a.recorded_at ASC`,
      [sessionId]
    );

    // 3. Prepare CSV Content
    let csvContent = '';

    // Add Header Rows
    csvContent += `"Class Name:","${class_name || 'N/A'}"\n`;
    csvContent += `"Subject:","${subject || 'N/A'}"\n`;
    csvContent += `"Section:","${section || 'N/A'}"\n`;
    const attendanceDate = session_date ? new Date(session_date).toLocaleDateString() : 'N/A';
    csvContent += `"Attendance Date:","${attendanceDate}"\n`;
    csvContent += `\n`; // Blank row

    // Add Data Headers
    const fields = ['Student ID', 'Full Name', 'Check-in Time'];
    csvContent += fields.join(',') + '\n';

    // Add Data Rows
    records.forEach(row => {
        let checkInTimeFormatted = 'N/A';
        if (row.check_in_time) {
            try {
                // Format time explicitly to UTC+8 (e.g., Singapore Time) for CSV
                // Use options for M/D/YYYY, H:MM:SS AM/PM format
                const utcPlus8Date = new Date(row.check_in_time);
                checkInTimeFormatted = utcPlus8Date.toLocaleString('en-SG', { 
                    timeZone: 'Asia/Singapore', // Explicitly UTC+8
                    year: 'numeric', 
                    month: 'numeric', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    second: '2-digit', 
                    hour12: true 
                });
            } catch (e) { console.error("Error formatting check-in time for CSV:", e); }
        }
        // Escape commas/quotes in names
        const studentNameEscaped = `"${(row.student_name || '').replace(/"/g, '""')}"`;

        csvContent += `${row.student_id || 'N/A'},${studentNameEscaped},"${checkInTimeFormatted}"\n`;
    });

    // 4. Set Headers and Send Response
    const fileName = `attendance_${class_name || 'class'}_${section || 'all'}_${sessionId.substring(0, 6)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Error exporting attendance CSV:', error);
    res.status(500).json({ success: false, message: 'Failed to export CSV', error: error.message });
  }
});

module.exports = router;