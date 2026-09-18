import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --env-file=.env prisma/seed.mts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
