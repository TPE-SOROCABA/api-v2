/*
  Warnings:

  - You are about to drop the column `config` on the `groups` table. All the data in the column will be lost.
  - You are about to drop the `week_designations` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `status` on the `designations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `event_days` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `event_days` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `weekday` on the `event_days` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `config_end_hour` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `config_max` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `config_min` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `config_start_hour` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `config_weekday` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `sex` on the `participants` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "DesignationStatus" AS ENUM ('OPEN', 'CANCELLED', 'CLOSED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('RECURRING', 'SPECIAL', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "ParticipantSex" AS ENUM ('MALE', 'FEMALE');

-- DropForeignKey
ALTER TABLE "week_designations" DROP CONSTRAINT "week_designations_designation_id_fkey";

-- DropForeignKey
ALTER TABLE "week_designations" DROP CONSTRAINT "week_designations_participant_id_fkey";

-- AlterTable
ALTER TABLE "designations" DROP COLUMN "status",
ADD COLUMN     "status" "DesignationStatus" NOT NULL;

-- AlterTable
ALTER TABLE "event_days" DROP COLUMN "type",
ADD COLUMN     "type" "EventType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "EventStatus" NOT NULL,
DROP COLUMN "weekday",
ADD COLUMN     "weekday" "Weekday" NOT NULL;

-- AlterTable
ALTER TABLE "groups" DROP COLUMN "config",
ADD COLUMN     "config_end_hour" TEXT NOT NULL,
ADD COLUMN     "config_max" INTEGER NOT NULL,
ADD COLUMN     "config_min" INTEGER NOT NULL,
ADD COLUMN     "config_start_hour" TEXT NOT NULL,
ADD COLUMN     "config_weekday" "Weekday" NOT NULL;

-- AlterTable
ALTER TABLE "participants" DROP COLUMN "sex",
ADD COLUMN     "sex" "ParticipantSex" NOT NULL;

-- DropTable
DROP TABLE "week_designations";
