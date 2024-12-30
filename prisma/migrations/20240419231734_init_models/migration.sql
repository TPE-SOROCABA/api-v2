-- CreateEnum
CREATE TYPE "ParticipantProfile" AS ENUM ('COORDINATOR', 'ASSISTANT_COORDINATOR', 'CAPTAIN', 'ASSISTANT_CAPTAIN', 'PARTICIPANT', 'ADMIN_ANALYST');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'IGNORED');

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "profile_photo" TEXT,
    "profile" "ParticipantProfile" NOT NULL DEFAULT 'PARTICIPANT',
    "computed" TEXT,
    "group_id" TEXT,
    "designationsId" TEXT,
    "assignmentsId" TEXT,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auths" (
    "id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "reset_password_code" TEXT,
    "participant_id" TEXT NOT NULL,

    CONSTRAINT "auths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_histories" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "designation_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_photo" TEXT NOT NULL,

    CONSTRAINT "points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_carts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "theme_photo" TEXT NOT NULL,
    "point_publication_cart_id" TEXT,
    "assignmentsId" TEXT,

    CONSTRAINT "publication_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_publication_carts" (
    "id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "min_participants" INTEGER NOT NULL,
    "max_participants" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "designation_template_id" TEXT,

    CONSTRAINT "point_publication_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designation_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "designation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "designation_template_id" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_days" (
    "id" TEXT NOT NULL,
    "coordinator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,

    CONSTRAINT "event_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "config_min" INTEGER NOT NULL,
    "config_max" INTEGER NOT NULL,
    "config_status" BOOLEAN NOT NULL,
    "designations_id" TEXT,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "week_designations" (
    "id" TEXT NOT NULL,
    "designation_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "week_designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participants_cpf_key" ON "participants"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "participants_phone_key" ON "participants"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "auths_participant_id_key" ON "auths"("participant_id");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_designationsId_fkey" FOREIGN KEY ("designationsId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_assignmentsId_fkey" FOREIGN KEY ("assignmentsId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auths" ADD CONSTRAINT "auths_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_histories" ADD CONSTRAINT "incident_histories_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_histories" ADD CONSTRAINT "incident_histories_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_carts" ADD CONSTRAINT "publication_carts_point_publication_cart_id_fkey" FOREIGN KEY ("point_publication_cart_id") REFERENCES "point_publication_carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_carts" ADD CONSTRAINT "publication_carts_assignmentsId_fkey" FOREIGN KEY ("assignmentsId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_publication_carts" ADD CONSTRAINT "point_publication_carts_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_publication_carts" ADD CONSTRAINT "point_publication_carts_designation_template_id_fkey" FOREIGN KEY ("designation_template_id") REFERENCES "designation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_designation_template_id_fkey" FOREIGN KEY ("designation_template_id") REFERENCES "designation_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_designations_id_fkey" FOREIGN KEY ("designations_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_designations" ADD CONSTRAINT "week_designations_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_designations" ADD CONSTRAINT "week_designations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
