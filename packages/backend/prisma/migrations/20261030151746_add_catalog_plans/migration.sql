-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('workout', 'meal');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('done', 'partial', 'skipped');

-- CreateTable
CREATE TABLE "templates" (
    "id" SERIAL NOT NULL,
    "type" "TemplateType" NOT NULL,
    "title" TEXT NOT NULL,
    "level_place" TEXT NOT NULL,
    "body_json" JSONB NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_plans" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "type" "TemplateType" NOT NULL,
    "title" TEXT NOT NULL,
    "level_place" TEXT NOT NULL,
    "body_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "daily_calories" INTEGER,

    CONSTRAINT "active_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_tasks" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "task_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TaskStatus",
    "details_json" JSONB,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "day_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "active_plans_user_id_type_is_active_idx" ON "active_plans"("user_id", "type", "is_active");

-- CreateIndex
CREATE INDEX "day_tasks_plan_id_task_date_idx" ON "day_tasks"("plan_id", "task_date");

-- AddForeignKey
ALTER TABLE "active_plans" ADD CONSTRAINT "active_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_plans" ADD CONSTRAINT "active_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_tasks" ADD CONSTRAINT "day_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "active_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
