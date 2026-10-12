-- CreateTable
CREATE TABLE "group_change_requests" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "participant_name" TEXT NOT NULL,
    "desired_slots" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requested_by_id" TEXT,
    "requested_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resolved_by_name" TEXT,
    "resolution" TEXT,
    "resolved_group_id" TEXT,
    "resolved_group_name" TEXT,

    CONSTRAINT "group_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_change_requests_status_idx" ON "group_change_requests"("status");

-- CreateIndex
CREATE INDEX "group_change_requests_participant_id_idx" ON "group_change_requests"("participant_id");
