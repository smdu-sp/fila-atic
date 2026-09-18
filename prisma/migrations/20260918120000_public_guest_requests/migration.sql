-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "trackingToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PendingGuestRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "customFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingGuestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicRequestAttempt" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicRequestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingGuestRequest_tokenHash_key" ON "PendingGuestRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingGuestRequest_email_idx" ON "PendingGuestRequest"("email");

-- CreateIndex
CREATE INDEX "PendingGuestRequest_expiresAt_idx" ON "PendingGuestRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "PublicRequestAttempt_kind_key_createdAt_idx" ON "PublicRequestAttempt"("kind", "key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_trackingToken_key" ON "Project"("trackingToken");

