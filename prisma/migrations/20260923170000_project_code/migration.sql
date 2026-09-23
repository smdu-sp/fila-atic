-- Sequential, human-facing project code ("ATC-0001"). Existing rows are
-- numbered by creation order explicitly: an ADD COLUMN ... DEFAULT
-- nextval(...) alone would number them in whatever physical row order
-- Postgres happens to scan the table in, which is not reliably creation
-- order once rows have been updated (this table's rows are updated often).
ALTER TABLE "Project" ADD COLUMN "code" INTEGER;

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Project"
)
UPDATE "Project" p SET "code" = ordered.rn
FROM ordered
WHERE ordered."id" = p."id";

CREATE SEQUENCE "Project_code_seq" AS INTEGER OWNED BY "Project"."code";
-- setval's value must be >= 1 (a sequence's own minimum); an empty table (a
-- brand new install) sets it with is_called=false so nextval() still returns 1.
SELECT setval(
  '"Project_code_seq"',
  COALESCE((SELECT MAX("code") FROM "Project"), 1),
  COALESCE((SELECT MAX("code") FROM "Project"), 0) > 0
);
ALTER TABLE "Project" ALTER COLUMN "code" SET DEFAULT nextval('"Project_code_seq"');
ALTER TABLE "Project" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
