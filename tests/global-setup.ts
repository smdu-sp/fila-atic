import { execSync } from "node:child_process";
import pg from "pg";

// Creates the <name>_test database when missing and applies every migration.
export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL nao definido");

  const dbName = new URL(testUrl).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Recusando rodar testes no banco "${dbName}"`);
  }

  const admin = new URL(testUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query(
      "select 1 from pg_database where datname = $1",
      [dbName],
    );
    if (!found.rowCount) {
      await client.query(`create database "${dbName}"`);
    }
    // Throwaway data: skipping the fsync on every commit makes TRUNCATE and
    // inserts several times faster, especially on Docker volumes.
    await client.query(
      `alter database "${dbName}" set synchronous_commit = off`,
    );
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
