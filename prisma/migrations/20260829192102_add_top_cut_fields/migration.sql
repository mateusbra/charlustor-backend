-- CreateEnum
CREATE TYPE "RoundPhase" AS ENUM ('SWISS', 'TOP_CUT');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "phase" "RoundPhase" NOT NULL DEFAULT 'SWISS';

