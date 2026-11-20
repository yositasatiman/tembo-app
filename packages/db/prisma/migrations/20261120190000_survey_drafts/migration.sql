-- CreateTable
CREATE TABLE "SurveyDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "stepsDone" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyDraft_ownerId_updatedAt_idx" ON "SurveyDraft"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "SurveyDraft" ADD CONSTRAINT "SurveyDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

