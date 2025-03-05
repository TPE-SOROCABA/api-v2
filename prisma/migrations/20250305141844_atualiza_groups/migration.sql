-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('MAIN', 'ADDITIONAL', 'SPECIAL');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "status" "GroupStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "type" "GroupType" NOT NULL DEFAULT 'MAIN';
