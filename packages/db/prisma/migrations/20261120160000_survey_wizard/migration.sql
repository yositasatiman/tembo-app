CREATE TYPE "SurveyRewardMode" AS ENUM ('EQUAL', 'DRAW');
ALTER TYPE "NotificationType" ADD VALUE 'SURVEY_REWARDED';
ALTER TYPE "NotificationType" ADD VALUE 'SURVEY_PRIZE_WON';
ALTER TYPE "NotificationType" ADD VALUE 'SURVEY_CONNECTED';
ALTER TABLE "Survey" ADD COLUMN     "category" TEXT,
ADD COLUMN     "codeEntryId" TEXT,
ADD COLUMN     "drawnAt" TIMESTAMP(3),
ADD COLUMN     "eligibleFaculties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "eligibleYears" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "estMinutes" INTEGER,
ADD COLUMN     "prizes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "rewardMode" "SurveyRewardMode" NOT NULL DEFAULT 'EQUAL',
ADD COLUMN     "webhookConnectedAt" TIMESTAMP(3),
ADD COLUMN     "webhookSecret" TEXT;
ALTER TABLE "SurveyResponse" ADD COLUMN     "prizeRank" INTEGER;
ALTER TABLE "SurveyStart" ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT;
CREATE UNIQUE INDEX "SurveyStart_token_key" ON "SurveyStart"("token");
