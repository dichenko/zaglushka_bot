import { writeFileSync } from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

async function exportCsv(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT * FROM bot_contacts ORDER BY created_at DESC"
    );

    const header = "id,tg_id,bot_link,created_at,updated_at";
    const rows = result.rows.map(
      (r) => `${r.id},${r.tg_id},${r.bot_link},${r.created_at},${r.updated_at}`
    );
    const csv = [header, ...rows].join("\n") + "\n";

    const outFile = process.argv[2] || "bot_contacts.csv";
    writeFileSync(outFile, csv, "utf-8");

    console.log(`Exported ${result.rowCount} rows to ${outFile}`);
  } finally {
    client.release();
    await pool.end();
  }
}

exportCsv().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
