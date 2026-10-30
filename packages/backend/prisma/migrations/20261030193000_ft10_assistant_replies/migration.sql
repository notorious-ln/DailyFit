-- AlterTable
ALTER TABLE "users" ADD COLUMN "free_note" TEXT;

-- CreateEnum
CREATE TYPE "AnalyzePeriod" AS ENUM ('day', 'week');

-- CreateEnum
CREATE TYPE "AssistantSource" AS ENUM ('llm', 'rules');

-- CreateTable
CREATE TABLE "assistant_replies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "period" "AnalyzePeriod" NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "text" TEXT NOT NULL,
    "source" "AssistantSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_replies_user_id_period_from_idx" ON "assistant_replies"("user_id", "period_from");

-- AddForeignKey
ALTER TABLE "assistant_replies" ADD CONSTRAINT "assistant_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
