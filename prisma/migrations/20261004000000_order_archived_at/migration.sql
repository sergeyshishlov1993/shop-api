-- AlterTable
ALTER TABLE "Order" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_archivedAt_idx" ON "Order"("archivedAt");
