-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedScore" TEXT,
ADD COLUMN     "reportedScoreA" TEXT,
ADD COLUMN     "reportedScoreB" TEXT,
ADD COLUMN     "resolvedByUserId" TEXT,
ADD COLUMN     "resultStatus" "MatchResult" NOT NULL DEFAULT 'PENDING';

