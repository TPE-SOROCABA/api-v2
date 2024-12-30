/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `participants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "email" TEXT,
ALTER COLUMN "cpf" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "participants_email_key" ON "participants"("email");
