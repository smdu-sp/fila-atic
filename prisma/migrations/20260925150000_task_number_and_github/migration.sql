-- Project.taskCounter, Task.number ---------------------------------------
ALTER TABLE "Project" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "number" INTEGER;

-- Existing tasks are numbered 1, 2, 3... inside their project by creation
-- date (the id breaks ties; the physical row order is never relied on).
UPDATE "Task" AS t
SET "number" = ranked.rn
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id") AS rn
    FROM "Task"
) AS ranked
WHERE t."id" = ranked."id";

ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;

-- the counter continues after the highest number in use
UPDATE "Project" AS p
SET "taskCounter" = COALESCE((SELECT max(t."number") FROM "Task" AS t WHERE t."projectId" = p."id"), 0);

CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");

-- GitHub integration -------------------------------------------------------
CREATE TABLE "TaskGithubActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "sha" TEXT,
    "author" TEXT,
    "movedTo" "TaskStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGithubActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GithubEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "ref" TEXT,
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GithubSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "repositories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mainBranch" TEXT NOT NULL DEFAULT 'main',
    "onPush" "TaskStatus" DEFAULT 'IN_PROGRESS',
    "onPullRequestOpened" "TaskStatus" DEFAULT 'TESTING',
    "onMerge" "TaskStatus" DEFAULT 'DONE',
    "onDeploy" "TaskStatus" DEFAULT 'DEPLOYED',
    "onlyForward" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskGithubActivity_taskId_createdAt_idx" ON "TaskGithubActivity"("taskId", "createdAt");
CREATE UNIQUE INDEX "TaskGithubActivity_taskId_dedupeKey_key" ON "TaskGithubActivity"("taskId", "dedupeKey");
CREATE INDEX "GithubEvent_createdAt_idx" ON "GithubEvent"("createdAt");

ALTER TABLE "TaskGithubActivity" ADD CONSTRAINT "TaskGithubActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
