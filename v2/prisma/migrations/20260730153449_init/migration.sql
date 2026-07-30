-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'SEPARATION', 'EXPEDITION', 'STOCK');

-- CreateEnum
CREATE TYPE "public"."CountStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MapStatus" AS ENUM ('SEPARATING', 'AWAITING_CONFERENCE', 'CONFERRING', 'APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "public"."ScanStage" AS ENUM ('SEPARATION', 'CONFERENCE');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gradeX" TEXT NOT NULL,
    "gradeY" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."balance_imports" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "linesRead" INTEGER NOT NULL DEFAULT 0,
    "linesSkipped" INTEGER NOT NULL DEFAULT 0,
    "unreconciled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."balances" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,

    CONSTRAINT "balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."count_sessions" (
    "id" TEXT NOT NULL,
    "status" "public"."CountStatus" NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."count_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "otherQty" INTEGER NOT NULL DEFAULT 0,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cargo_maps" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "public"."MapStatus" NOT NULL DEFAULT 'SEPARATING',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "cargo_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."map_items" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "separated" INTEGER NOT NULL DEFAULT 0,
    "conferred" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "map_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scans" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "itemId" TEXT,
    "productId" TEXT,
    "stage" "public"."ScanStage" NOT NULL,
    "barcode" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "reason" TEXT,
    "scannedBy" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."divergences" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divergences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "public"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "public"."sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "products_description_idx" ON "public"."products"("description");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_gradeX_gradeY_key" ON "public"."products"("code", "gradeX", "gradeY");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "public"."products"("barcode");

-- CreateIndex
CREATE INDEX "balance_imports_createdAt_idx" ON "public"."balance_imports"("createdAt");

-- CreateIndex
CREATE INDEX "balances_productId_idx" ON "public"."balances"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "balances_importId_productId_key" ON "public"."balances"("importId", "productId");

-- CreateIndex
CREATE INDEX "count_sessions_status_idx" ON "public"."count_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "count_items_sessionId_productId_key" ON "public"."count_items"("sessionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_maps_number_key" ON "public"."cargo_maps"("number");

-- CreateIndex
CREATE INDEX "cargo_maps_status_idx" ON "public"."cargo_maps"("status");

-- CreateIndex
CREATE UNIQUE INDEX "map_items_mapId_productId_key" ON "public"."map_items"("mapId", "productId");

-- CreateIndex
CREATE INDEX "scans_mapId_stage_idx" ON "public"."scans"("mapId", "stage");

-- CreateIndex
CREATE INDEX "divergences_mapId_resolved_idx" ON "public"."divergences"("mapId", "resolved");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balances" ADD CONSTRAINT "balances_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."balance_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balances" ADD CONSTRAINT "balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."count_items" ADD CONSTRAINT "count_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."count_items" ADD CONSTRAINT "count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."map_items" ADD CONSTRAINT "map_items_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."cargo_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."map_items" ADD CONSTRAINT "map_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scans" ADD CONSTRAINT "scans_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."cargo_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."divergences" ADD CONSTRAINT "divergences_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."cargo_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
