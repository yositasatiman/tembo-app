-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

