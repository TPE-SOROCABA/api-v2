-- CreateEnum
CREATE TYPE "PetitionStatus" AS ENUM ('CREATED', 'WAITING_INFORMATION', 'WAITING', 'ACTIVE', 'SUSPENDED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "petitions" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "status" "PetitionStatus" NOT NULL DEFAULT 'CREATED',
    "public_url" TEXT NOT NULL,
    "private_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "petitions_protocol_key" ON "petitions"("protocol");
