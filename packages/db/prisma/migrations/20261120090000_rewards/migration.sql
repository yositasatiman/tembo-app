-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TxType" ADD VALUE 'REWARD_REDEEM';
ALTER TYPE "TxType" ADD VALUE 'REWARD_REFUND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REWARD_FULFILLED';
ALTER TYPE "NotificationType" ADD VALUE 'REWARD_CANCELLED';

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "cost" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reward_active_cost_idx" ON "Reward"("active", "cost");

-- CreateIndex
CREATE INDEX "RewardRedemption_status_createdAt_idx" ON "RewardRedemption"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RewardRedemption_userId_createdAt_idx" ON "RewardRedemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardRedemption_rewardId_userId_idx" ON "RewardRedemption"("rewardId", "userId");

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- กันสต็อกติดลบ / ราคาไม่ถูกต้อง แม้มีคำขอพร้อมกัน
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_stock_nonneg" CHECK ("stock" >= 0);
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_cost_pos" CHECK ("cost" > 0);
