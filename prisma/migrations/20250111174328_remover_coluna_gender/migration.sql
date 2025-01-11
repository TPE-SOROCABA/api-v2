/*
  Warnings:

  - You are about to drop the column `gender` on the `participants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "participants" DROP COLUMN "gender";

-- DropEnum
DROP TYPE "Gender";
