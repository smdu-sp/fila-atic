CREATE TABLE "MailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailLog_createdAt_idx" ON "MailLog"("createdAt");
