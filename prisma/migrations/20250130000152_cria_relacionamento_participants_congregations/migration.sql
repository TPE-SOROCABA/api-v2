/*
  Warnings:

  - You are about to drop the column `congregation` on the `participants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "participants" DROP COLUMN "congregation",
ADD COLUMN     "congregation_id" INTEGER;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
