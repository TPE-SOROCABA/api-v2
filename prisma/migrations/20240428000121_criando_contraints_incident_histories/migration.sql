/*
  Warnings:

  - A unique constraint covering the columns `[participant_id,designation_id]` on the table `incident_histories` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "incident_histories_participant_id_designation_id_key" ON "incident_histories"("participant_id", "designation_id");
