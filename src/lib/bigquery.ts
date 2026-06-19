import { BigQuery } from "@google-cloud/bigquery";
import type { UsageRow } from "./types";
import { MOCK_USAGE } from "./mock";

function useMock(): boolean {
  return (
    process.env.USE_MOCK_DATA === "true" ||
    !process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    !process.env.BIGQUERY_PROJECT_ID
  );
}

function client(): BigQuery {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!) as {
    client_email: string;
    private_key: string;
  };
  return new BigQuery({
    projectId: process.env.BIGQUERY_PROJECT_ID,
    credentials: {
      client_email: sa.client_email,
      private_key: sa.private_key.replace(/\\n/g, "\n"),
    },
  });
}

/** 정산월 사용량(사용 ISBN별 고유 사용자수)을 BigQuery에서 집계 */
export async function fetchUsage(startDate: string, endDate: string): Promise<UsageRow[]> {
  if (useMock()) return MOCK_USAGE;

  const bq = client();
  let query: string;
  const params: Record<string, string> = { startDate, endDate };

  if (process.env.BIGQUERY_USAGE_SQL) {
    // bookips 데이터 커넥터 SQL을 그대로 사용 (플레이스홀더 치환)
    query = process.env.BIGQUERY_USAGE_SQL.replace(/\{\{START_DATE\}\}/g, "@startDate").replace(
      /\{\{END_DATE\}\}/g,
      "@endDate"
    );
  } else {
    // 표준 집계 쿼리 (테이블/컬럼명은 환경에 맞게 조정 필요)
    const dataset = process.env.BIGQUERY_DATASET!;
    const table = process.env.BIGQUERY_USAGE_TABLE!;
    query = `
      SELECT
        publisher,
        isbn AS usedIsbn,
        ANY_VALUE(bookName) AS bookName,
        COUNT(DISTINCT userHash) AS userCount
      FROM \`${dataset}.${table}\`
      WHERE usageDate BETWEEN @startDate AND @endDate
      GROUP BY publisher, isbn
      ORDER BY publisher, userCount DESC
    `;
  }

  const [rows] = await bq.query({ query, params });
  return (rows as Record<string, unknown>[]).map((r) => ({
    publisher: (r.publisher as string) ?? null,
    usedIsbn: String(r.usedIsbn ?? r.isbn ?? ""),
    bookName: (r.bookName as string) ?? null,
    userCount: Number(r.userCount ?? 0),
  }));
}
