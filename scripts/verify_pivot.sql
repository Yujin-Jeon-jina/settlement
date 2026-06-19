-- ───────────────────────────────────────────────────────────────
-- 피벗 일치 검증용 SQL (BigQuery 콘솔에 붙여넣고 실행)
--
-- 목적: 앱이 쓰는 집계 결과가 bookips 시트의 'Pivot' 탭과 같은지 확인.
-- Pivot 탭은 (publisher + isbn)로 묶고 COUNTUNIQUE(userHash)로 고유 사용자를 센다.
-- 아래 쿼리는 그것을 SQL로 그대로 재현한다. (단가는 계약목록에서 오므로 여기엔 없음)
--
-- 사용법:
--   1) 아래 @START_YYYYMMDD / @END_YYYYMMDD 를 정산월로 바꾼다 (예: 2026-06-01 / 2026-06-30)
--   2) [A] 출판사별 고유 사용자 합계 → 피벗 좌상단 '출판사별 합계'와 대조
--      (단, 피벗 합계는 '금액'이고 이건 '사용자수 합'이라 단가 확인 후 비교 권장)
--   3) [B] 출판사·ISBN별 사용자수 → 피벗 본문의 'COUNTUNIQUE of userHash' 컬럼과 1:1 대조
-- ───────────────────────────────────────────────────────────────

DECLARE START_YYYYMMDD DATE DEFAULT DATE '2026-06-01';
DECLARE END_YYYYMMDD   DATE DEFAULT DATE '2026-06-30';

WITH base AS (
  SELECT
    l.*,
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
      book_title AS bookTitle,
      DATETIME(registered_at, 'Asia/Seoul') AS registeredAt,
      DATETIME(deleted_at, 'Asia/Seoul')    AS deletedAt
    FROM `mathpresso-data.qanda_rds_live.bookips_usage_logs`
  ) l
  LEFT JOIN `mathpresso-data.qanda_rds_live.books` b ON l.isbn = b.isbn
  WHERE COALESCE(l.registeredAt, l.deletedAt) >= START_YYYYMMDD
    AND COALESCE(l.registeredAt, l.deletedAt) <  DATE_ADD(END_YYYYMMDD, INTERVAL 1 DAY)
)

-- [B] 출판사·ISBN별 고유 사용자수 (피벗 본문과 1:1 대조)
SELECT
  publisher,
  isbn AS usedIsbn,
  ANY_VALUE(bookTitle) AS bookName,
  COUNT(DISTINCT userHash) AS userCount
FROM base
WHERE publisher IS NOT NULL AND isbn IS NOT NULL
GROUP BY publisher, isbn
ORDER BY publisher, userCount DESC;

-- [A] 출판사별 고유 사용자 합계만 보고 싶으면 위 SELECT 대신 아래 사용:
-- SELECT publisher, SUM(userCount) AS total_users, COUNT(*) AS book_count
-- FROM (
--   SELECT publisher, isbn, COUNT(DISTINCT userHash) AS userCount
--   FROM base WHERE publisher IS NOT NULL AND isbn IS NOT NULL
--   GROUP BY publisher, isbn
-- )
-- GROUP BY publisher ORDER BY publisher;
