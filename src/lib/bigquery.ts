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

/**
 * 원시 사용 로그 쿼리 (bookips 데이터 커넥터가 쓰는 것과 동일).
 * @START_YYYYMMDD / @END_YYYYMMDD (DATE) 파라미터를 사용한다.
 * 노출 컬럼: publisher, isbn, bookTitle, userHash (집계에 필요한 최소 컬럼).
 * 필요 시 BIGQUERY_USAGE_SQL 환경변수로 통째 교체 가능.
 */
const DEFAULT_BASE_SQL = `
  SELECT
    l.*,
    CASE
      WHEN b.publisher LIKE '%NE능률%' THEN 'NE능률'
      WHEN b.publisher LIKE '%개념원리%' THEN '개념원리'
      WHEN b.publisher LIKE '%쎄듀%' THEN '쎄듀'
      WHEN b.publisher LIKE '%지학사%' THEN '지학사'
      WHEN b.publisher LIKE '%키출판사%' THEN '키출판사'
      WHEN b.publisher LIKE '%마더텅%' THEN '마더텅'
      WHEN b.publisher LIKE '%수경출판%' THEN '수경출판사'
    END AS publisher
  FROM (
    SELECT
      user_hash AS userHash,
      CAST(isbn AS STRING) AS isbn,
      book_title AS bookTitle,
      DATETIME(registered_at, 'Asia/Seoul') AS registeredAt,
      DATETIME(deleted_at, 'Asia/Seoul') AS deletedAt
    FROM \`mathpresso-data.qanda_rds_live.bookips_usage_logs\`
  ) l
  LEFT JOIN \`mathpresso-data.qanda_rds_live.books\` b ON l.isbn = b.isbn
  WHERE COALESCE(l.registeredAt, l.deletedAt) >= @START_YYYYMMDD
    AND COALESCE(l.registeredAt, l.deletedAt) < DATE_ADD(@END_YYYYMMDD, INTERVAL 1 DAY)
`;

/** 정산월 사용량(사용 ISBN별 고유 사용자수)을 BigQuery에서 집계 */
export async function fetchUsage(startDate: string, endDate: string): Promise<UsageRow[]> {
  if (useMock()) return MOCK_USAGE;

  const baseSql = process.env.BIGQUERY_USAGE_SQL || DEFAULT_BASE_SQL;

  // 시트의 Pivot(= publisher+isbn 그룹 / COUNTUNIQUE(userHash))을 SQL 집계로 재현.
  const query = `
    WITH base AS (${baseSql})
    SELECT
      publisher,
      isbn AS usedIsbn,
      ANY_VALUE(bookTitle) AS bookName,
      COUNT(DISTINCT userHash) AS userCount
    FROM base
    WHERE publisher IS NOT NULL AND isbn IS NOT NULL
    GROUP BY publisher, isbn
    ORDER BY publisher, userCount DESC
  `;

  const bq = client();
  const [rows] = await bq.query({
    query,
    params: { START_YYYYMMDD: startDate, END_YYYYMMDD: endDate },
    types: { START_YYYYMMDD: "DATE", END_YYYYMMDD: "DATE" },
  });

  return (rows as Record<string, unknown>[]).map((r) => {
    const price = r["단가"] ?? r.unitPrice;
    return {
      publisher: (r.publisher as string) ?? null,
      usedIsbn: String(r.usedIsbn ?? ""),
      bookName: (r.bookName as string) ?? null,
      userCount: Number(r.userCount ?? 0),
      unitPrice: price == null ? null : Number(price),
    };
  });
}
