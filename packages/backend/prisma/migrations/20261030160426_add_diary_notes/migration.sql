-- CreateEnum
CREATE TYPE "Feeling" AS ENUM ('easy', 'normal', 'hard');

-- CreateTable
CREATE TABLE "diary_notes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "note_date" DATE NOT NULL,
    "feeling" "Feeling" NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "user_comment" TEXT,
    "advisor_comment" TEXT,

    CONSTRAINT "diary_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diary_notes_user_id_note_date_key" ON "diary_notes"("user_id", "note_date");

-- AddForeignKey
ALTER TABLE "diary_notes" ADD CONSTRAINT "diary_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
