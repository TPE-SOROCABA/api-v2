/*
  Warnings:

  - A unique constraint covering the columns `[hash]` on the table `petitions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `hash` to the `petitions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "petitions" ADD COLUMN     "hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "petitions_hash_key" ON "petitions"("hash");
