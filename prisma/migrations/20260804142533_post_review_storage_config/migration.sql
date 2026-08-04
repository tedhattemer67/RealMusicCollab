/*
  Warnings:

  - You are about to drop the column `storageAdapter` on the `Mix` table. All the data in the column will be lost.
  - You are about to drop the column `storageAdapter` on the `Take` table. All the data in the column will be lost.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `storageConfigId` to the `Mix` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storageConfigId` to the `Take` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "action",
ADD COLUMN     "action" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Mix" DROP COLUMN "storageAdapter",
ADD COLUMN     "storageConfigId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Take" DROP COLUMN "storageAdapter",
ADD COLUMN     "storageConfigId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "AuditAction";

-- CreateTable
CREATE TABLE "StorageConfig" (
    "id" TEXT NOT NULL,
    "type" "StorageAdapter" NOT NULL,
    "label" TEXT,
    "projectId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "StorageConfig" ADD CONSTRAINT "StorageConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Take" ADD CONSTRAINT "Take_storageConfigId_fkey" FOREIGN KEY ("storageConfigId") REFERENCES "StorageConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mix" ADD CONSTRAINT "Mix_storageConfigId_fkey" FOREIGN KEY ("storageConfigId") REFERENCES "StorageConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
