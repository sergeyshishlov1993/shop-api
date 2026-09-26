-- Instagram: лайки, коментарі та час оновлення
ALTER TABLE "InstagramPost" ADD COLUMN "likesCount" INTEGER, ADD COLUMN "commentsCount" INTEGER, ADD COLUMN "statsUpdatedAt" TIMESTAMP(3);
