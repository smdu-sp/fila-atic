-- CreateTable
CREATE TABLE "TaskStatusLabel" (
    "id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStatusLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatusLabel_status_key" ON "TaskStatusLabel"("status");
