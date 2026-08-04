/*
  Warnings:

  - A unique constraint covering the columns `[mixId,userId]` on the table `Approval` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[currentMixId]` on the table `Song` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MixStatus" AS ENUM ('DRAFT', 'FINAL');

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_takeId_fkey";

-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "mixId" TEXT;

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "mixId" TEXT,
ALTER COLUMN "takeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "currentMixId" TEXT;

-- CreateTable
CREATE TABLE "Mix" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "mixNumber" INTEGER NOT NULL,
    "storageAdapter" "StorageAdapter" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "status" "MixStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MixComponent" (
    "id" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "takeId" TEXT NOT NULL,

    CONSTRAINT "MixComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mix_songId_mixNumber_key" ON "Mix"("songId", "mixNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MixComponent_mixId_trackId_key" ON "MixComponent"("mixId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_mixId_userId_key" ON "Approval"("mixId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Song_currentMixId_key" ON "Song"("currentMixId");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_currentMixId_fkey" FOREIGN KEY ("currentMixId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mix" ADD CONSTRAINT "Mix_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mix" ADD CONSTRAINT "Mix_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixComponent" ADD CONSTRAINT "MixComponent_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixComponent" ADD CONSTRAINT "MixComponent_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixComponent" ADD CONSTRAINT "MixComponent_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
