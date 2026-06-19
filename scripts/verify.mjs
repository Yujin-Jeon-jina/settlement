#!/usr/bin/env node
/*
 * 실데이터 검증 스크립트 (웹앱 없이 단독 실행).
 *
 * 사용:
 *   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform
 *   BIGQUERY_PROJECT_ID=mathpresso-data node scripts/verify.mjs 2026-06-01 2026-06-30
 *
 * 출력:
 *   - 출판사별 (ALLOWED 기준) 금액 합계  ← bookips 피벗의 '출판사별 합계'와 대조
 *   - 출판사별 고유 사용자 합계
 *   - status 분포
 *
 * ※ app과 동일한 집계 로직(WITH base + GROUP BY publisher,isbn / COUNT(DISTINCT userHash) /
 *    MAX(consumer_price) / status)을 사용한다.
 */
import { BigQuery } from "@google-cloud/bigquery";

const [, , start, end] = process.argv;
if (!start || !end) {
  console.error("usage: node scripts/verify.mjs <START_YYYY-MM-DD> <END_YYYY-MM-DD>");
  process.exit(1);
}

const ACTIVE = (process.env.CONTRACT_ACTIVE_STATUSES || "ALLOWED")
  .split(",").map((s) => s.trim().toUpperCase());

const query = `
  WITH base AS (
    SELECT
      l.*, c.status AS status, c.consumer_price AS consumerPrice,
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
      SELECT user_hash AS userHash, CAST(isbn AS STRING) AS isbn, book_title AS bookTitle,
             DATETIME(registered_at,'Asia/Seoul') AS registeredAt,
             DATETIME(deleted_at,'Asia/Seoul') AS deletedAt
      FROM \`mathpresso-data.qanda_rds_live.bookips_usage_logs\`
    ) l
    LEFT JOIN \`mathpresso-data.qanda_rds_live.books\` b ON l.isbn = b.isbn
    LEFT JOIN \`mathpresso-data.qanda_rds_live.book_contracts\` c ON l.isbn = c.isbn
    WHERE COALESCE(l.registeredAt, l.deletedAt) >= @START
      AND COALESCE(l.registeredAt, l.deletedAt) < DATE_ADD(@END, INTERVAL 1 DAY)
  ),
  agg AS (
    SELECT publisher, isbn,
           COUNT(DISTINCT userHash) AS userCount,
           MAX(consumerPrice) AS unitPrice,
           COALESCE(MAX(IF(status='ALLOWED','ALLOWED',NULL)), ANY_VALUE(status)) AS status
    FROM base
    WHERE publisher IS NOT NULL AND isbn IS NOT NULL
    GROUP BY publisher, isbn
  )
  SELECT
    publisher,
    SUM(IF(UPPER(IFNULL(status,'')) IN UNNEST(@ACTIVE), userCount*IFNULL(unitPrice,0), 0)) AS allowedAmount,
    SUM(userCount) AS totalUsers,
    COUNTIF(UPPER(IFNULL(status,'')) IN UNNEST(@ACTIVE)) AS allowedBooks,
    COUNTIF(UPPER(IFNULL(status,'')) NOT IN UNNEST(@ACTIVE)) AS otherBooks
  FROM agg
  GROUP BY publisher
  ORDER BY allowedAmount DESC
`;

const bq = new BigQuery({ projectId: process.env.BIGQUERY_PROJECT_ID });
const [rows] = await bq.query({
  query,
  params: { START: start, END: end, ACTIVE },
  types: { START: "DATE", END: "DATE", ACTIVE: ["STRING"] },
});

console.log(`\n정산월 ${start} ~ ${end}  (승인 status: ${ACTIVE.join(",")})\n`);
console.log("출판사".padEnd(12), "승인금액".padStart(14), "사용자합".padStart(10), "승인책".padStart(7), "기타책".padStart(7));
console.log("-".repeat(56));
let tAmt = 0, tUsr = 0;
for (const r of rows) {
  tAmt += Number(r.allowedAmount); tUsr += Number(r.totalUsers);
  console.log(
    String(r.publisher).padEnd(12),
    Number(r.allowedAmount).toLocaleString("ko-KR").padStart(14),
    String(r.totalUsers).padStart(10),
    String(r.allowedBooks).padStart(7),
    String(r.otherBooks).padStart(7)
  );
}
console.log("-".repeat(56));
console.log("합계".padEnd(12), tAmt.toLocaleString("ko-KR").padStart(14), String(tUsr).padStart(10));
console.log("\n※ '승인금액'을 bookips 피벗의 출판사별 합계와 대조하세요.");
console.log("   차이가 나면 '기타책'(개정판/EXPIRED/DENIED)은 매칭 후 추가 정산 대상입니다.\n");
