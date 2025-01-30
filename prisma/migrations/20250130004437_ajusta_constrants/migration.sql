/*
  Warnings:

  - Made the column `email` on table `participants` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "participants_cpf_key";

-- AlterTable
ALTER TABLE "participants" ALTER COLUMN "email" SET NOT NULL;
