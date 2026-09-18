import path from "node:path";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(path.resolve(".env"));
} catch {
  // no .env (CI): DATABASE_URL must come from the environment
}

// Tests run against their own database, never the development one:
// <name>_test on the same server. tests/global-setup.ts creates and migrates it.
const devUrl =
  process.env.DATABASE_URL ??
  "postgresql://root:rootpassword@localhost:5432/fila_atic_db";
const url = new URL(devUrl);
const devName = url.pathname.slice(1);
url.pathname = `/${devName.endsWith("_test") ? devName : `${devName}_test`}`;
const testUrl = url.toString();

process.env.TEST_DATABASE_URL = testUrl;

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // One shared database: files run one after the other.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: testUrl,
      NEXTAUTH_SECRET: "test-secret",
      NEXTAUTH_URL: "http://localhost:3010",
      PUBLIC_REQUEST_ALLOWED_DOMAINS: "teste.gov.br,prefeitura.sp.gov.br",
      ENVIRONMENT: "local",
      SMTP_HOST: "",
    },
  },
});
