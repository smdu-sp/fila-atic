-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Label_name_key" ON "Label"("name");

-- Backfill: every free-text label already in use becomes a palette entry.
-- Spellings that only differ in case collapse into one (the alphabetically
-- first spelling wins) and the colors rotate through a fixed set.
INSERT INTO "Label" ("id", "name", "color", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "name",
    (ARRAY['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#64748b'])[
        1 + ((row_number() OVER (ORDER BY lower("name")) - 1) % 8)::int
    ],
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower(tag)) tag AS "name"
    FROM "Task", unnest("labels") AS tag
    ORDER BY lower(tag), tag
) AS distinct_tags;

-- Tasks keep the palette spelling of each label (same order as before).
UPDATE "Task" AS t
SET "labels" = ARRAY(
    SELECT l."name"
    FROM unnest(t."labels") WITH ORDINALITY AS u(tag, ord)
    JOIN "Label" AS l ON lower(l."name") = lower(u.tag)
    ORDER BY u.ord
)
WHERE cardinality(t."labels") > 0;
