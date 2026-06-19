import type { ContractBook, UsageRow } from "./types";
import { MOCK_CONTRACTS, MOCK_USAGE } from "./mock";
import { getBigQuery, useMock as gcpUseMock, withRetry } from "./gcp";

// 자격증명(서비스계정 또는 본인 OAuth)이 없거나, 프로젝트 ID가 없으면 목업.
function useMock(): boolean {
  return gcpUseMock() || !process.env.BIGQUERY_PROJECT_ID;
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
    c.status AS status,
    c.consumer_price AS consumerPrice,
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
  LEFT JOIN \`mathpresso-data.qanda_rds_live.book_contracts\` c ON l.isbn = c.isbn
  -- 정산 기준(확정): 그 달에 '신규 등록'한 사용자만 카운트 = 피벗/bookips와 동일.
  -- COALESCE(registered_at, deleted_at)가 정산월 안에 드는 행만 포함(이전 달 등록·계속 사용분 제외).
  WHERE COALESCE(l.registeredAt, l.deletedAt) >= @START_YYYYMMDD
    AND COALESCE(l.registeredAt, l.deletedAt) < DATE_ADD(@END_YYYYMMDD, INTERVAL 1 DAY)
`;

/** 정산월 사용량(사용 ISBN별 고유 사용자수)을 BigQuery에서 집계 */
export async function fetchUsage(startDate: string, endDate: string): Promise<UsageRow[]> {
  if (useMock()) return MOCK_USAGE;

  const baseSql = process.env.BIGQUERY_USAGE_SQL || DEFAULT_BASE_SQL;

  // 시트의 Pivot(= publisher+isbn 그룹 / COUNTUNIQUE(userHash) / MAX(단가))을 SQL 집계로 재현.
  // status는 ALLOWED가 하나라도 있으면 ALLOWED로, 없으면 대표값으로.
  const query = `
    WITH base AS (${baseSql})
    SELECT
      publisher,
      isbn AS usedIsbn,
      ANY_VALUE(bookTitle) AS bookName,
      COUNT(DISTINCT userHash) AS userCount,
      MAX(consumerPrice) AS unitPrice,
      COALESCE(MAX(IF(status = 'ALLOWED', 'ALLOWED', NULL)), ANY_VALUE(status)) AS status
    FROM base
    WHERE publisher IS NOT NULL AND isbn IS NOT NULL
    GROUP BY publisher, isbn
    ORDER BY publisher, userCount DESC
  `;

  const [rows] = await withRetry(() =>
    getBigQuery().query({
      query,
      params: { START_YYYYMMDD: startDate, END_YYYYMMDD: endDate },
      types: { START_YYYYMMDD: "DATE", END_YYYYMMDD: "DATE" },
    })
  );

  return (rows as Record<string, unknown>[]).map((r) => {
    const price = r.unitPrice ?? r["단가"];
    return {
      publisher: (r.publisher as string) ?? null,
      usedIsbn: String(r.usedIsbn ?? ""),
      bookName: (r.bookName as string) ?? null,
      userCount: Number(r.userCount ?? 0),
      unitPrice: price == null ? null : Number(price),
      status: (r.status as string) ?? null,
    };
  });
}

/**
 * 계약 교재(승인=ALLOWED) 목록을 BigQuery에서 조회 → 매칭 후보 소스.
 * books(제목/출판사) ⋈ book_contracts(consumer_price). Sheets 의존 제거용.
 */
export async function fetchContractedBooks(): Promise<ContractBook[]> {
  if (useMock()) return MOCK_CONTRACTS;

  const active = (process.env.CONTRACT_ACTIVE_STATUSES || "ALLOWED")
    .split(",")
    .map((s) => `'${s.trim().toUpperCase()}'`)
    .join(",");

  const query = `
    SELECT
      CAST(b.isbn AS STRING) AS isbn,
      ANY_VALUE(b.name) AS title,
      ANY_VALUE(
        CASE
          WHEN b.publisher LIKE '%NE능률%' THEN 'NE능률'
          WHEN b.publisher LIKE '%개념원리%' THEN '개념원리'
          WHEN b.publisher LIKE '%쎄듀%' THEN '쎄듀'
          WHEN b.publisher LIKE '%지학사%' THEN '지학사'
          WHEN b.publisher LIKE '%키출판사%' THEN '키출판사'
          WHEN b.publisher LIKE '%마더텅%' THEN '마더텅'
          WHEN b.publisher LIKE '%수경출판%' THEN '수경출판사'
          ELSE b.publisher
        END) AS publisher,
      MAX(c.consumer_price) AS bookPrice
    FROM \`mathpresso-data.qanda_rds_live.books\` b
    JOIN \`mathpresso-data.qanda_rds_live.book_contracts\` c
      ON CAST(b.isbn AS STRING) = CAST(c.isbn AS STRING)
    WHERE UPPER(c.status) IN (${active})
    GROUP BY b.isbn
  `;

  const [rows] = await withRetry(() => getBigQuery().query({ query }));
  return (rows as Record<string, unknown>[]).map((r) => ({
    isbn: String(r.isbn ?? ""),
    title: (r.title as string) ?? "",
    publisher: (r.publisher as string) ?? "",
    bookPrice: Number(r.bookPrice ?? 0),
    startDate: null,
    endDate: null,
  }));
}
