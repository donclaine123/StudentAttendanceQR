require("dotenv").config(); // Load environment variables from .env file
const mysql = require("mysql2/promise");
const fs = require('fs');
const path = require('path');

// Note: Do not log DB_PASS in production for security reasons

// SSL Configuration for cloud hosted databases (Render, Aiven, Railway, AWS RDS, etc.)
let sslConfig = undefined;

if (process.env.DB_SSL !== "false") {
  const caPath = path.join(__dirname, 'certs', 'ca.pem');
  const caExists = fs.existsSync(caPath);
  
  // rejectUnauthorized defaults to false so cloud SSL connections don't fail on issuer mismatch
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";

  sslConfig = {
    rejectUnauthorized: rejectUnauthorized
  };

  if (caExists && process.env.USE_CUSTOM_CA === "true") {
    try {
      sslConfig.ca = fs.readFileSync(caPath);
    } catch (err) {
      console.warn("Could not read ca.pem certificate file:", err.message);
    }
  }
}

// Create a connection pool with better error handling
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test the connection with better error handling
const testConnection = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query("SELECT 1 + 1 AS result");
  } catch (error) {
    console.error("✗ Database connection failed:", error.message);
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error("Connection was lost. Please check your database credentials and connection.");
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("Access denied. Please check your username and password.");
    } else if (error.code === 'ECONNREFUSED') {
      console.error("Connection refused. Please check if the database server is running.");
    }
    throw error;
  } finally {
    if (conn) conn.release();
  }
};

// Test connection immediately
testConnection().catch(err => {
  console.error("Failed to establish database connection:", err);
  process.exit(1);
});

// Export the pool for use in other files
module.exports = pool;