/*
  Warnings:

  - You are about to drop the column `assignmentsId` on the `publication_carts` table. All the data in the column will be lost.
  - You are about to drop the column `point_publication_cart_id` on the `publication_carts` table. All the data in the column will be lost.
  - Made the column `designations_id` on table `assignments` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `publication_cart_id` to the `point_publication_carts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_designations_id_fkey";

-- DropForeignKey
ALTER TABLE "publication_carts" DROP CONSTRAINT "publication_carts_assignmentsId_fkey";

-- DropForeignKey
ALTER TABLE "publication_carts" DROP CONSTRAINT "publication_carts_point_publication_cart_id_fkey";

-- AlterTable
ALTER TABLE "assignments" ALTER COLUMN "designations_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "point_publication_carts" ADD COLUMN     "publication_cart_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "publication_carts" DROP COLUMN "assignmentsId",
DROP COLUMN "point_publication_cart_id",
ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "theme_photo" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "point_publication_carts" ADD CONSTRAINT "point_publication_carts_publication_cart_id_fkey" FOREIGN KEY ("publication_cart_id") REFERENCES "publication_carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_designations_id_fkey" FOREIGN KEY ("designations_id") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
