-- Тумблер повернень у налаштуваннях
ALTER TABLE "StoreSettings" ADD COLUMN "returnsEnabled" BOOLEAN NOT NULL DEFAULT true;
