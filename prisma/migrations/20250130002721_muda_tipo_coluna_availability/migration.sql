/*
  Warnings:

  - The `availability` column on the `participants` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "participants" DROP COLUMN "availability",
ADD COLUMN     "availability" JSONB[];
