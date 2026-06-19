-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('auto', 'confirmed', 'unauthorized', 'unmatched');

-- CreateTable
CREATE TABLE "IsbnMapping" (
    "usedIsbn" TEXT NOT NULL,
    "contractIsbn" TEXT,
    "publisher" TEXT NOT NULL,
    "bookName" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'confirmed',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsbnMapping_pkey" PRIMARY KEY ("usedIsbn")
);

-- CreateTable
CREATE TABLE "SettlementRun" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "usedIsbn" TEXT NOT NULL,
    "contractIsbn" TEXT,
    "bookName" TEXT NOT NULL,
    "userCount" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "matchStatus" "MatchStatus" NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IsbnMapping_publisher_idx" ON "IsbnMapping"("publisher");

-- CreateIndex
CREATE INDEX "IsbnMapping_contractIsbn_idx" ON "IsbnMapping"("contractIsbn");

-- CreateIndex
CREATE INDEX "SettlementRun_periodStart_periodEnd_idx" ON "SettlementRun"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SettlementLine_runId_idx" ON "SettlementLine"("runId");

-- CreateIndex
CREATE INDEX "SettlementLine_publisher_idx" ON "SettlementLine"("publisher");

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SettlementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

