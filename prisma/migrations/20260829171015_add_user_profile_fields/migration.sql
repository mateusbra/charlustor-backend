-- AlterTable
ALTER TABLE "User" ADD COLUMN     "masterDuelFriendCode" TEXT,
ADD COLUMN     "nickname" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");
