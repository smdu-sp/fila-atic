-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELED';

-- CreateTable
CREATE TABLE "ProjectStatusChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" "ProjectStatus",
    "toStatus" "ProjectStatus" NOT NULL,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectStatusChange_projectId_createdAt_idx" ON "ProjectStatusChange"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectStatusChange" ADD CONSTRAINT "ProjectStatusChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Baseline history: the current status of every existing project, dated by its
-- last update. Approximate, but lets reports know how long open projects have
-- been in their current status.
INSERT INTO "ProjectStatusChange" ("id", "projectId", "fromStatus", "toStatus", "changedByName", "createdAt")
SELECT gen_random_uuid()::text, "id", NULL, "status", 'Sistema (migracao)', "updatedAt"
FROM "Project";

-- Data repair: a developer holding a task must belong to the project team,
-- otherwise a restricted developer cannot even see the task assigned to them.
INSERT INTO "ProjectDeveloper" ("projectId", "userId")
SELECT DISTINCT t."projectId", t."assigneeId"
FROM "Task" t
JOIN "User" u ON u."id" = t."assigneeId"
WHERE u."role" IN ('DEV_GLOBAL', 'DEV_RESTRICTED')
ON CONFLICT DO NOTHING;
