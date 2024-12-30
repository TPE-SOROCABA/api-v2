-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "cancellation_justification" TEXT,
ADD COLUMN     "mandatory_presence" BOOLEAN NOT NULL DEFAULT true;
