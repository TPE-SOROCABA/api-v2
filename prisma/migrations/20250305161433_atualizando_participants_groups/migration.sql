-- CreateEnum
CREATE TYPE "ParticipantGroupProfile" AS ENUM ('CAPTAIN', 'ASSISTANT_CAPTAIN', 'PARTICIPANT');

-- AlterTable
ALTER TABLE "participants" ALTER COLUMN "profile" DROP NOT NULL;

-- AlterTable
ALTER TABLE "participants_groups" ADD COLUMN     "profile" "ParticipantProfile" NOT NULL DEFAULT 'PARTICIPANT';
