-- CreateEnum
CREATE TYPE "CivilStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "attributions" TEXT[],
ADD COLUMN     "availability" JSONB,
ADD COLUMN     "baptism_date" TIMESTAMP(3),
ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "civil_status" "CivilStatus",
ADD COLUMN     "congregation" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "has_minor_child" BOOLEAN,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "petition_id" TEXT,
ADD COLUMN     "spouse_participant" BOOLEAN,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zip_code" TEXT;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_petition_id_fkey" FOREIGN KEY ("petition_id") REFERENCES "petitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
