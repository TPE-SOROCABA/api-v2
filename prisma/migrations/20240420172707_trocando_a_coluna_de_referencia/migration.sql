/*
  Warnings:

  - You are about to drop the column `designations_id` on the `point_publication_carts` table. All the data in the column will be lost.
  - Added the required column `group_id` to the `point_publication_carts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "point_publication_carts" DROP CONSTRAINT "point_publication_carts_designations_id_fkey";

-- AlterTable
ALTER TABLE "point_publication_carts" DROP COLUMN "designations_id",
ADD COLUMN     "group_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "point_publication_carts" ADD CONSTRAINT "point_publication_carts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
