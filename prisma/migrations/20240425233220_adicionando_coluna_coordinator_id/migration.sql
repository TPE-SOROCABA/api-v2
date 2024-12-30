-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "coordinator_id" TEXT;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
