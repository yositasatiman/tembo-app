-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CANCELLED', 'ENDED');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('UNIVERSITY', 'FACULTY', 'CLUB');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TxType" ADD VALUE 'EVENT_REWARD';

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverUrl" TEXT,
    "location" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "registrationUrl" TEXT,
    "rewardPerCheckIn" INTEGER NOT NULL DEFAULT 0,
    "rewardSlots" INTEGER NOT NULL DEFAULT 0,
    "postFee" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "escrowWalletId" TEXT NOT NULL,
    "checkInSecret" TEXT NOT NULL,
    "registeredCount" INTEGER NOT NULL DEFAULT 0,
    "checkedInCount" INTEGER NOT NULL DEFAULT 0,
    "rewardedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "reward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventHide" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventHide_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_escrowWalletId_key" ON "Event"("escrowWalletId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "Event"("organizerId");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_createdAt_idx" ON "EventRegistration"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventRegistration_userId_idx" ON "EventRegistration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventHide_userId_idx" ON "EventHide"("userId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_escrowWalletId_fkey" FOREIGN KEY ("escrowWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHide" ADD CONSTRAINT "EventHide_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHide" ADD CONSTRAINT "EventHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

