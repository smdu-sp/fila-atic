-- CreateTable
CREATE TABLE "NotebookPage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookPageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "editedByName" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookPageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookPageAttachment" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookPageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotebookPage_parentId_idx" ON "NotebookPage"("parentId");

-- CreateIndex
CREATE INDEX "NotebookPageRevision_pageId_editedAt_idx" ON "NotebookPageRevision"("pageId", "editedAt");

-- CreateIndex
CREATE INDEX "NotebookPageAttachment_pageId_idx" ON "NotebookPageAttachment"("pageId");

-- AddForeignKey
ALTER TABLE "NotebookPage" ADD CONSTRAINT "NotebookPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookPageRevision" ADD CONSTRAINT "NotebookPageRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookPageAttachment" ADD CONSTRAINT "NotebookPageAttachment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

