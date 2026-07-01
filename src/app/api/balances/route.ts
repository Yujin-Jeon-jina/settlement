import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DB 실시간 반영 필수: Route Handler 응답 캐시 비활성화(저장 후 즉시 최신값)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.publisherBalance.findMany();
    const balances: Record<string, number> = {};
    rows.forEach((r) => (balances[r.publisher] = r.prevBalance));
    return NextResponse.json({ balances });
  } catch (e) {
    return NextResponse.json({ error: String(e), balances: {} }, { status: 200 });
  }
}

/** 출판사별 전월 MG 잔액 저장 */
export async function PUT(req: NextRequest) {
  const { publisher, prevBalance } = (await req.json().catch(() => ({}))) as {
    publisher?: string;
    prevBalance?: number;
  };
  if (!publisher) return NextResponse.json({ error: "publisher 필요" }, { status: 400 });
  try {
    const v = Math.round(Number(prevBalance ?? 0));
    await prisma.publisherBalance.upsert({
      where: { publisher },
      create: { publisher, prevBalance: v },
      update: { prevBalance: v },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
