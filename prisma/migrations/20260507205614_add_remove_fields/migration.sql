-- CreateEnum
CREATE TYPE "RequestFieldType" AS ENUM ('TEXT', 'LONG_TEXT');

-- AlterTable
ALTER TABLE "ProjectRequestField" ADD COLUMN     "fieldType" "RequestFieldType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "key" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProjectRequestFieldValue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRequestFieldValue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProjectRequestFieldValue" ADD CONSTRAINT "ProjectRequestFieldValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequestFieldValue" ADD CONSTRAINT "ProjectRequestFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProjectRequestField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
