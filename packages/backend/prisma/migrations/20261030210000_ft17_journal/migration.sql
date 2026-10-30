-- CreateEnum
CREATE TYPE "JournalEvent" AS ENUM (
  'register',
  'login',
  'plan_activated',
  'task_mark_changed',
  'analysis_requested',
  'recommendation_accepted',
  'recommendation_rejected',
  'external_call_error',
  'template_created',
  'template_updated',
  'template_hidden'
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event" "JournalEvent" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_entries_user_id_created_at_idx" ON "journal_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "journal_entries_event_created_at_idx" ON "journal_entries"("event", "created_at");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
