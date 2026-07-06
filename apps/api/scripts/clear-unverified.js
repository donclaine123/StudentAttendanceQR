require('dotenv').config();
const db = require('../db');

async function checkUnverified() {
  try {
    const [teachers] = await db.query("SELECT id, email, is_verified, created_at FROM teachers WHERE is_verified = FALSE");
    console.log("Unverified Teachers:", teachers);

    const [students] = await db.query("SELECT id, email, is_verified, created_at FROM students WHERE is_verified = FALSE");
    console.log("Unverified Students:", students);
  } catch (err) {
    console.error("Error querying unverified records:", err.message);
  } finally {
    await db.end();
  }
}

checkUnverified();
