-- CreateTable
CREATE TABLE "PublisherBalance" (
    "publisher" TEXT NOT NULL,
    "prevBalance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherBalance_pkey" PRIMARY KEY ("publisher")
);
