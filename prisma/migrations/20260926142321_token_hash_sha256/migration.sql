-- Старі bcrypt-хеші не збігаються з новим SHA-256 — такі сесії/токени більше не валідні.
DELETE FROM "RefreshSession" WHERE "tokenHash" LIKE '$2%';
DELETE FROM "PasswordResetToken" WHERE "tokenHash" LIKE '$2%';

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
