import { NextRequest, NextResponse } from "next/server";
import { fetchUsage } from "@/lib/bigquery";
import { fetchPivotCounts } from "@/lib/google";

interface DiffRow {
  publisher: string;
  usedIsbn: string;
  bookName: string;
  bqCount: number | null;
  pivotCount: number | null;
  match: boolean;
}

/**
 * BigQuery 집계 결과 ↔ bookips 시트 Pivot 탭을 ISBN 단위로 대조.
 * 주의: 시트 Pivot은 마지막으로 새로고침한 기간 기준이므로, 같은 정산월로 맞춘 뒤 비교할 것.
 */
export async function POST(req: NextRequest) {
  const { startDate, endDate } = (await req.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
  };
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate, endDate 필요" }, { status: 400 });
  }
  try {
    const [usage, pivot] = await Promise.all([fetchUsage(startDate, endDate), fetchPivotCounts()]);

    const bq = new Map(usage.map((u) => [u.usedIsbn, u]));
    const pv = new Map(pivot.map((p) => [p.usedIsbn, p]));
    const isbns = new Set<string>([...bq.keys(), ...pv.keys()]);

    const rows: DiffRow[] = [];
    for (const isbn of isbns) {
      const b = bq.get(isbn);
      const p = pv.get(isbn);
      const bqCount = b ? b.userCount : null;
      const pivotCount = p ? p.userCount : null;
      rows.push({
        publisher: (b?.publisher || p?.publisher || "") as string,
        usedIsbn: isbn,
        bookName: (b?.bookName || p?.bookName || "") as string,
        bqCount,
        pivotCount,
        match: bqCount === pivotCount,
      });
    }
    rows.sort((a, b) => Number(a.match) - Number(b.match) || a.publisher.localeCompare(b.publisher));

    const mismatched = rows.filter((r) => !r.match);
    return NextResponse.json({
      summary: {
        total: rows.length,
        matched: rows.length - mismatched.length,
        mismatched: mismatched.length,
        bqTotalUsers: usage.reduce((a, u) => a + u.userCount, 0),
        pivotTotalUsers: pivot.reduce((a, p) => a + p.userCount, 0),
      },
      rows,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
