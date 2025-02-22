/*
  Warnings:

  - Added the required column `name` to the `petitions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "petitions" ADD COLUMN     "name" TEXT NOT NULL;
