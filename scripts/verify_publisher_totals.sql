-- ───────────────────────────────────────────────────────────────
-- 출판사별 '승인금액' 대조용 (BigQuery 콘솔에 붙여넣고 실행 — 터미널 불필요)
--
-- 결과의 '승인금액'을 bookips 피벗의 '출판사별 합계'와 비교하세요.
-- 맨 윗줄 두 날짜(START_D / END_D)만 정산월로 바꾸면 됩니다.
--   (앱과 동일한 집계: publisher+isbn 그룹 / COUNT(DISTINCT userHash) /
--    MAX(consumer_price) 단가 / status=ALLOWED만 정산)
-- ───────────────────────────────────────────────────────────────

DECLARE START_D DATE DEFAULT DATE '2026-06-01';
DECLARE END_D   DATE DEFAULT DATE '2026-06-30';

WITH base AS (
  SELECT
    l.userHash, l.isbn,
    c.status AS status,
    c.consumer_price AS price,
    CASE
      WHEN b.publisher LIKE '%NE능률%'   THEN 'NE능률'
      WHEN b.publisher LIKE '%개념원리%' THEN '개념원리'
      WHEN b.publisher LIKE '%쎄듀%'     THEN '쎄듀'
      WHEN b.publisher LIKE '%지학사%'   THEN '지학사'
      WHEN b.publisher LIKE '%키출판사%' THEN '키출판사'
      WHEN b.publisher LIKE '%마더텅%'   THEN '마더텅'
      WHEN b.publisher LIKE '%수경출판%' THEN '수경출판사'
    END AS publisher
  FROM (
    SELECT
      user_hash AS userHash,
      CAST(isbn AS STRING) AS isbn,
      DATETIME(registered_at, 'Asia/Seoul') AS registeredAt,
      DATETIME(deleted_at, 'Asia/Seoul')    AS deletedAt
    FROM `mathpresso-data.qanda_rds_live.bookips_usage_logs`
  ) l
  LEFT JOIN `mathpresso-data.qanda_rds_live.books`          b ON l.isbn = b.isbn
  LEFT JOIN `mathpresso-data.qanda_rds_live.book_contracts` c ON l.isbn = c.isbn
  WHERE COALESCE(l.registeredAt, l.deletedAt) >= START_D
    AND COALESCE(l.registeredAt, l.deletedAt) <  DATE_ADD(END_D, INTERVAL 1 DAY)
),
agg AS (
  SELECT
    publisher, isbn,
    COUNT(DISTINCT userHash) AS userCount,
    MAX(price) AS unitPrice,
    COALESCE(MAX(IF(status = 'ALLOWED', 'ALLOWED', NULL)), ANY_VALUE(status)) AS status
  FROM base
  WHERE publisher IS NOT NULL AND isbn IS NOT NULL
  GROUP BY publisher, isbn
)
SELECT
  publisher AS 출판사,
  SUM(IF(status = 'ALLOWED', userCount * IFNULL(unitPrice, 0), 0)) AS 승인금액,
  SUM(userCount) AS 사용자합,
  COUNTIF(status = 'ALLOWED') AS 승인책수,
  COUNTIF(status IS NULL OR status != 'ALLOWED') AS 기타책수
FROM agg
GROUP BY publisher
ORDER BY 승인금액 DESC;
