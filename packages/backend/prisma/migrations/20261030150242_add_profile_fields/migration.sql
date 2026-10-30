-- CreateEnum
CREATE TYPE "TrainingPlace" AS ENUM ('home', 'gym');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "height_cm" DOUBLE PRECISION,
ADD COLUMN     "limitation_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "place" "TrainingPlace",
ADD COLUMN     "weight_kg" DOUBLE PRECISION,
ADD COLUMN     "workouts_per_week" INTEGER;
