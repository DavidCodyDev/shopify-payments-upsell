-- CreateTable
CREATE TABLE "UpsellOffer" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "variantId" TEXT,
    "variantLegacyId" TEXT,
    "productTitle" TEXT,
    "productImageUrl" TEXT,
    "productDescription" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "offerTitle" TEXT NOT NULL DEFAULT 'It''s not too late to add this to your order',
    "offerBody" TEXT NOT NULL DEFAULT 'Add this product to your order. You''ll be charged with the same payment method.',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpsellEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_createdAt_idx" ON "UpsellEvent"("shop", "createdAt");
