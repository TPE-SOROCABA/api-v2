/*
  Warnings:

  - You are about to drop the column `coordinator_id` on the `event_days` table. All the data in the column will be lost.
  - You are about to drop the column `assignmentsId` on the `participants` table. All the data in the column will be lost.
  - You are about to drop the column `designationsId` on the `participants` table. All the data in the column will be lost.
  - You are about to drop the column `group_id` on the `participants` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "event_days" DROP CONSTRAINT "event_days_coordinator_id_fkey";

-- DropForeignKey
ALTER TABLE "participants" DROP CONSTRAINT "participants_assignmentsId_fkey";

-- DropForeignKey
ALTER TABLE "participants" DROP CONSTRAINT "participants_designationsId_fkey";

-- DropForeignKey
ALTER TABLE "participants" DROP CONSTRAINT "participants_group_id_fkey";

-- AlterTable
ALTER TABLE "event_days" DROP COLUMN "coordinator_id";

-- AlterTable
ALTER TABLE "participants" DROP COLUMN "assignmentsId",
DROP COLUMN "designationsId",
DROP COLUMN "group_id";

-- CreateTable
CREATE TABLE "participants_groups" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "participants_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_days_groups" (
    "id" TEXT NOT NULL,
    "event_day_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "event_days_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments_participants" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,

    CONSTRAINT "assignments_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments_publication_carts" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "publication_cart_id" TEXT NOT NULL,

    CONSTRAINT "assignments_publication_carts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "participants_groups" ADD CONSTRAINT "participants_groups_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants_groups" ADD CONSTRAINT "participants_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_histories" ADD CONSTRAINT "incident_histories_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_days_groups" ADD CONSTRAINT "event_days_groups_event_day_id_fkey" FOREIGN KEY ("event_day_id") REFERENCES "event_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_days_groups" ADD CONSTRAINT "event_days_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments_participants" ADD CONSTRAINT "assignments_participants_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments_participants" ADD CONSTRAINT "assignments_participants_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments_publication_carts" ADD CONSTRAINT "assignments_publication_carts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments_publication_carts" ADD CONSTRAINT "assignments_publication_carts_publication_cart_id_fkey" FOREIGN KEY ("publication_cart_id") REFERENCES "publication_carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
