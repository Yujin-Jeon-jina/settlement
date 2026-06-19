import { NextRequest, NextResponse } from "next/server";
import { fetchUsage } from "@/lib/bigquery";
import { fetchContracts } from "@/lib/google";
import { buildSettlementDraft, summarize } from "@/lib/settlement";
import { prisma } from "@/lib/db";

interface StoredMapping {
  usedIsbn: string;
  contractIsbn: string | null;
  status: "confirmed" | "unauthorized";
}

// DB가 없거나 연결 실패해도 UI 데모가 가능하도록 안전하게 빈 배열 반환
async function getStoredMappings(): Promise<StoredMapping[]> {
  try {
    const rows = await prisma.isbnMapping.findMany({
      where: { status: { in: ["confirmed", "unauthorized"] } },
    });
    return rows.map((r) => ({
      usedIsbn: r.usedIsbn,
      contractIsbn: r.contractIsbn,
      status: r.status as "confirmed" | "unauthorized",
    }));
  } catch {
    return [];
  }
}

/** 정산월 사용량 집계 → 매칭 초안 + 출판사별 요약 */
export async function POST(req: NextRequest) {
  const { startDate, endDate } = (await req.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
  };
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate, endDate 필요" }, { status: 400 });
  }
  try {
    const [usage, contracts, stored] = await Promise.all([
      fetchUsage(startDate, endDate),
      fetchContracts(),
      getStoredMappings(),
    ]);
    const lines = buildSettlementDraft(usage, contracts, stored);
    const summary = summarize(lines);
    return NextResponse.json({ lines, summary, contractCount: contracts.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
