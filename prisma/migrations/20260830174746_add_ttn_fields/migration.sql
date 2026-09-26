-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cityRef" TEXT,
ADD COLUMN     "warehouseRef" TEXT;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "npSenderCityRef" TEXT,
ADD COLUMN     "npSenderContactRef" TEXT,
ADD COLUMN     "npSenderPhone" TEXT,
ADD COLUMN     "npSenderRef" TEXT,
ADD COLUMN     "npSenderWarehouseRef" TEXT;
