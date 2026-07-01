import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 정산 이력 1건 상세 (라인 포함) */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  }
  try {
    const run = await prisma.settlementRun.findUnique({
      where: { id },
      include: { lines: { orderBy: [{ publisher: "asc" }, { amount: "desc" }] } },
    });
    if (!run) return NextResponse.json({ error: "없음" }, { status: 404 });
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
