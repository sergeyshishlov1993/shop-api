-- Instagram: позначка поста-відео для вбудованого плеєра
ALTER TABLE "InstagramPost" ADD COLUMN "isVideo" BOOLEAN NOT NULL DEFAULT false;
