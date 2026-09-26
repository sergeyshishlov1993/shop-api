-- AlterTable: окремі точки фокуса банера для планшета і телефона
ALTER TABLE "HeroSlide"
  ADD COLUMN "focalXTablet" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "focalYTablet" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "focalXMobile" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "focalYMobile" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- Існуючі слайди: стартові значення = десктопна точка
UPDATE "HeroSlide" SET "focalXTablet" = "focalX", "focalYTablet" = "focalY", "focalXMobile" = "focalX", "focalYMobile" = "focalY";
