/*
  Warnings:

  - The `profile` column on the `participants_groups` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "participants_groups" DROP COLUMN "profile",
ADD COLUMN     "profile" "ParticipantGroupProfile" NOT NULL DEFAULT 'PARTICIPANT';
