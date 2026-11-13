-- CreateEnum
CREATE TYPE "SurveyMode" AS ENUM ('IN_APP', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "completionCode" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "mode" "SurveyMode" NOT NULL DEFAULT 'IN_APP';

-- CreateTable
CREATE TABLE "SurveyStart" (
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SurveyStart_pkey" PRIMARY KEY ("surveyId","userId")
);

-- CreateIndex
CREATE INDEX "SurveyStart_userId_idx" ON "SurveyStart"("userId");

-- AddForeignKey
ALTER TABLE "SurveyStart" ADD CONSTRAINT "SurveyStart_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyStart" ADD CONSTRAINT "SurveyStart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

