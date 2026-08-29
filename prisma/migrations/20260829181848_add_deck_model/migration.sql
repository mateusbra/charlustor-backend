-- CreateEnum
CREATE TYPE "DeckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "mainExtraImage" TEXT NOT NULL,
    "sideImage" TEXT NOT NULL,
    "decodedCards" JSONB NOT NULL,
    "validationStatus" "DeckStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deck_participantId_key" ON "Deck"("participantId");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

