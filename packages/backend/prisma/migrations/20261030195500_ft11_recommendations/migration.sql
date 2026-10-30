-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('draft', 'accepted', 'partially_accepted', 'rejected');

-- CreateTable
CREATE TABLE "recommendations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "source" "AssistantSource" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'draft',
    "summary_text" TEXT NOT NULL,
    "items_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_user_id_created_at_idx" ON "recommendations"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
