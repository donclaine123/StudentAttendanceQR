require('dotenv').config();
const db = require('../db');

async function verifyTables() {
  try {
    const [tables] = await db.query("SHOW TABLES");
    console.log("Tables in database '" + process.env.DB_NAME + "':");
    tables.forEach(t => console.log(" - " + Object.values(t)[0]));
  } catch (err) {
    console.error("Error verifying tables:", err.message);
  } finally {
    await db.end();
  }
}

verifyTables();
