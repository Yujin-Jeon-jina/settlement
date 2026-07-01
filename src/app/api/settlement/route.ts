import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SettlementLineDraft } from "@/lib/types";

// DB 실시간 반영 필수: Route Handler 응답 캐시 비활성화
export const dynamic = "force-dynamic";

/** 확정된 정산 라인을 이력으로 저장 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
    lines?: SettlementLineDraft[];
    createdBy?: string;
  };
  if (!body.startDate || !body.endDate || !body.lines) {
    return NextResponse.json({ error: "startDate, endDate, lines 필요" }, { status: 400 });
  }
  try {
    const run = await prisma.settlementRun.create({
      data: {
        periodStart: new Date(body.startDate),
        periodEnd: new Date(body.endDate),
        status: "saved",
        createdBy: body.createdBy ?? null,
        lines: {
          create: body.lines.map((l) => ({
            publisher: l.publisher,
            usedIsbn: l.usedIsbn,
            contractIsbn: l.contractIsbn,
            bookName: l.bookName,
            userCount: l.userCount,
            unitPrice: l.unitPrice,
            amount: l.amount,
            matchStatus: l.matchStatus,
          })),
        },
      },
      include: { lines: true },
    });
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const runs = await prisma.settlementRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { lines: true } } },
    });
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json({ error: String(e), runs: [] }, { status: 200 });
  }
}
