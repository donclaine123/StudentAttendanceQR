# QR Code Student Attendance System (EazyAttend)

A full-stack student attendance tracking web application leveraging real-time dynamic QR code generation, camera-based QR scanning, secure session-based authentication, and automated attendance record exports.

## Live Application

Production:
- Frontend: https://eazyattend.netlify.app
- Backend API: https://qrattendance-backend.onrender.com

## Features

- **Role-Based Authentication & Verification**: Multi-role support (Students, Teachers, Admins) with bcrypt password hashing, session cookies, and email token verification via Nodemailer / Brevo.
- **Dynamic QR Code Generation & Scanning**: Teachers generate time-limited, session-specific QR codes while students scan via device camera directly in the browser to log attendance.
- **Interactive Dashboards**: Tailored portals for students to view personal attendance history, teachers to manage classes/sessions, and admins to oversee platform activity.
- **Class & Roster Management**: Organize courses by subject, section, and teacher with real-time student participation logging.
- **Data Export & Analytics**: Export class attendance logs and session records in CSV format.
- **Audit Logging & Background Cleanup**: Tracks admin actions in an audit log and runs automated cron jobs to clean up expired sessions and unverified accounts.

## Tech Stack

- **Frontend**: HTML5, Vanilla CSS (Glassmorphism & responsive UI), Vanilla JavaScript, HTML5-QRCode Scanner
- **Backend**: Node.js, Express.js, `express-session`, `node-cron`
- **Database**: MySQL / TiDB Cloud (with SSL connection via CA certificates)
- **Hosting**: Netlify (Frontend) & Render (Backend Web Service)
- **Email / Notification**: Brevo API / Nodemailer (SMTP)

## Architecture

Brief explanation of how the application and cloud components interact:

```
User (Student / Teacher / Admin)
  ↓ (HTTPS / Browser)
Frontend (Netlify CDN & API Reverse Proxy)
  ↓ (REST API / JSON / Cookies)
Backend API (Render Node.js & Express Web Service)
  ↓ (TLS / SSL via CA Cert)
Database (MySQL / TiDB Cloud)
```

1. **Client Layer**: The user accesses the static web application hosted on Netlify.
2. **Reverse Proxy & REST API**: API calls from the client are routed to the Express.js backend hosted on Render.
3. **Authentication & Session Store**: Express authenticates requests against custom MySQL-backed session stores and validates role-based permissions.
4. **Data Persistence**: Attendance, class records, and user credentials are encrypted and stored in the managed MySQL database.

## Cloud Infrastructure

| Component | Service | Purpose |
|---|---|---|
| Frontend | Netlify | Hosts static assets, handles CDN delivery and `/api/*` reverse proxy redirects |
| Backend | Render | Deploys and executes the Node.js / Express REST API with auto-deployments |
| Database | TiDB Cloud / AWS RDS | Managed scalable MySQL database storage with SSL/TLS encryption |
| Email Service | Brevo / Nodemailer SMTP | Delivers account verification and password reset emails |
| Security / SSL | Custom CA (`certs/ca.pem`) | Validates secure database connections over TLS |

## Environment Variables

The application backend requires the following environment variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=production
API_URL=https://qrattendance-backend.onrender.com
FRONTEND_URL=https://eazyattend.netlify.app

# Database Configuration
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASS=
DB_NAME=student_attendance
DB_URL=

# Session Configuration
SESSION_SECRET=
SESSION_TABLE=sessions
SESSION_LIFETIME=86400000

# Email Delivery (SMTP / Brevo)
EMAIL_USER=
EMAIL_PASS=
BREVO_API_KEY=
RESEND_API_KEY=

# Admin Authorization
ADMIN_SECRET=
```
