/*
  Warnings:

  - You are about to drop the column `designation_template_id` on the `groups` table. All the data in the column will be lost.
  - You are about to drop the column `designation_template_id` on the `point_publication_carts` table. All the data in the column will be lost.
  - You are about to drop the `designation_templates` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `designations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `designations_id` to the `point_publication_carts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "groups" DROP CONSTRAINT "groups_designation_template_id_fkey";

-- DropForeignKey
ALTER TABLE "point_publication_carts" DROP CONSTRAINT "point_publication_carts_designation_template_id_fkey";

-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "groups" DROP COLUMN "designation_template_id";

-- AlterTable
ALTER TABLE "point_publication_carts" DROP COLUMN "designation_template_id",
ADD COLUMN     "designations_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "designation_templates";

-- AddForeignKey
ALTER TABLE "point_publication_carts" ADD CONSTRAINT "point_publication_carts_designations_id_fkey" FOREIGN KEY ("designations_id") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
