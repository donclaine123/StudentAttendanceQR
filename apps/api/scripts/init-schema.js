require('dotenv').config();

const db = require('../db');

const statements = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    verification_token VARCHAR(255) NULL UNIQUE,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    direct_login_key VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_teacher_email (email),
    INDEX idx_teacher_verification_token (verification_token),
    INDEX idx_teacher_direct_login_key (direct_login_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    verification_token VARCHAR(255) NULL UNIQUE,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_student_email (email),
    INDEX idx_student_student_id (student_id),
    INDEX idx_student_verification_token (verification_token)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    data LONGTEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(20) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sessions_user (user_id, role, is_active),
    INDEX idx_sessions_expires (expires_at),
    INDEX idx_sessions_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS class_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NULL,
    class_name VARCHAR(100) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_teacher_id (teacher_id),
    CONSTRAINT fk_class_records_teacher
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS qr_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL UNIQUE,
    teacher_id INT NOT NULL,
    class_id INT NOT NULL,
    section VARCHAR(100) NULL,
    subject VARCHAR(100) NULL,
    expires_at DATETIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qr_sessions_session_id (session_id),
    INDEX idx_qr_sessions_teacher_id (teacher_id),
    INDEX idx_qr_sessions_class_id (class_id),
    INDEX idx_qr_sessions_expires_at (expires_at),
    CONSTRAINT fk_qr_sessions_teacher
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_qr_sessions_class
      FOREIGN KEY (class_id) REFERENCES class_records(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    student_id INT NOT NULL,
    teacher_id INT NOT NULL,
    subject VARCHAR(100) NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_attendance_session_student (session_id, student_id),
    INDEX idx_attendance_session_id (session_id),
    INDEX idx_attendance_student_id (student_id),
    INDEX idx_attendance_teacher_id (teacher_id),
    CONSTRAINT fk_attendance_session
      FOREIGN KEY (session_id) REFERENCES qr_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_student
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_teacher
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_resets_user (user_id, user_role),
    INDEX idx_password_resets_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(50) NULL,
    details LONGTEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_audit_admin_id (admin_id),
    INDEX idx_admin_audit_action_type (action_type),
    INDEX idx_admin_audit_target_type (target_type),
    INDEX idx_admin_audit_timestamp (timestamp),
    CONSTRAINT fk_admin_audit_log_admin
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

async function main() {
  try {
    for (const statement of statements) {
      await db.query(statement);
    }

    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();