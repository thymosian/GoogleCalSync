import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function testConnection() {
  try {
    console.log("🔍 Testing database connection...");
    const result = await sql`SELECT version()`;
    console.log("✅ Database connection successful!");
    console.log("📦 PostgreSQL Version:", result[0].version);
  } catch (error) {
    console.error("❌ Database connection failed!");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

testConnection();