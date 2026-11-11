
-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('PENDING_REVIEW', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubsidyStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('OWNER', 'SPONSOR', 'SUBSIDY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TxType" ADD VALUE 'POST_FEE';
ALTER TYPE "TxType" ADD VALUE 'ESCROW_FUND';
ALTER TYPE "TxType" ADD VALUE 'SUBSIDY';
ALTER TYPE "TxType" ADD VALUE 'SURVEY_REWARD';
ALTER TYPE "TxType" ADD VALUE 'ESCROW_REFUND';

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questionCount" INTEGER NOT NULL,
    "rewardPerResponse" INTEGER NOT NULL,
    "quota" INTEGER NOT NULL,
    "targetPool" INTEGER NOT NULL,
    "postFee" INTEGER NOT NULL,
    "status" "SurveyStatus" NOT NULL,
    "subsidyStatus" "SubsidyStatus" NOT NULL DEFAULT 'NONE',
    "subsidyAmount" INTEGER NOT NULL DEFAULT 0,
    "subsidyNote" TEXT,
    "escrowWalletId" TEXT NOT NULL,
    "responsesCount" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyContribution" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "kind" "ContributionKind" NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "refunded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reward" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Survey_escrowWalletId_key" ON "Survey"("escrowWalletId");

-- CreateIndex
CREATE INDEX "Survey_status_createdAt_idx" ON "Survey"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Survey_ownerId_idx" ON "Survey"("ownerId");

-- CreateIndex
CREATE INDEX "Survey_subsidyStatus_idx" ON "Survey"("subsidyStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyContribution_surveyId_key_key" ON "SurveyContribution"("surveyId", "key");

-- CreateIndex
CREATE INDEX "SurveyResponse_userId_idx" ON "SurveyResponse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyId_userId_key" ON "SurveyResponse"("surveyId", "userId");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_escrowWalletId_fkey" FOREIGN KEY ("escrowWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyContribution" ADD CONSTRAINT "SurveyContribution_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyContribution" ADD CONSTRAINT "SurveyContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

