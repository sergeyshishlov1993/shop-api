-- CreateTable
CREATE TABLE "ProductWearWith" (
    "productId" INTEGER NOT NULL,
    "relatedProductId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductWearWith_pkey" PRIMARY KEY ("productId","relatedProductId")
);

-- CreateIndex
CREATE INDEX "ProductWearWith_productId_idx" ON "ProductWearWith"("productId");

-- AddForeignKey
ALTER TABLE "ProductWearWith" ADD CONSTRAINT "ProductWearWith_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductWearWith" ADD CONSTRAINT "ProductWearWith_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
