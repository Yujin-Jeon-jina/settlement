import { NextRequest, NextResponse } from "next/server";
import { fetchUsage } from "@/lib/bigquery";
import { parseUsageCsv } from "@/lib/usagecsv";
import { getContracts } from "@/lib/contracts";
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

/**
 * 정산월 사용량 → 매칭 초안 + 출판사별 요약.
 * - csv 전달 시: BigQuery에서 내보낸 사용량 CSV를 파싱(서버측 Google 인증 불필요, 토큰 만료 없음).
 * - csv 없이 startDate/endDate만: 라이브 BigQuery 조회(자격증명 있을 때).
 */
export async function POST(req: NextRequest) {
  const { startDate, endDate, csv } = (await req.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
    csv?: string;
  };

  try {
    let usage;
    if (csv && csv.trim()) {
      usage = parseUsageCsv(csv);
      if (usage.length === 0) {
        return NextResponse.json({ error: "CSV에서 사용 행을 찾지 못했습니다. 헤더/내용을 확인하세요." }, { status: 400 });
      }
    } else {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate, endDate 또는 csv 필요" }, { status: 400 });
      }
      usage = await fetchUsage(startDate, endDate);
    }

    const [contracts, stored] = await Promise.all([getContracts(), getStoredMappings()]);
    const lines = buildSettlementDraft(usage, contracts, stored);
    const summary = summarize(lines);
    return NextResponse.json({ lines, summary, contractCount: contracts.length, source: csv ? "csv" : "bigquery" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
