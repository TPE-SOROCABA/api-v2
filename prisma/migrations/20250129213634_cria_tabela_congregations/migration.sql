-- CreateTable
CREATE TABLE "congregations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "congregations_pkey" PRIMARY KEY ("id")
);
