-- CreateTable
CREATE TABLE "ProjectLogAttachment" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectLogAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProjectLogAttachment" ADD CONSTRAINT "ProjectLogAttachment_logId_fkey" FOREIGN KEY ("logId") REFERENCES "ProjectLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
