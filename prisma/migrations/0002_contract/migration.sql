-- CreateTable
CREATE TABLE "Contract" (
    "isbn" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bookPrice" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "endDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("isbn")
);

-- CreateIndex
CREATE INDEX "Contract_publisher_idx" ON "Contract"("publisher");
