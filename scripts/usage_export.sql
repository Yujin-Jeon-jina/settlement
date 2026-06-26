-- ───────────────────────────────────────────────────────────────
-- 정산 사용량 내보내기 (BigQuery 콘솔용)
--
-- 목적: 정산 앱에 업로드할 "사용량 CSV"를 만든다.
--   (서버에서 BigQuery 직접 조회 시 조직 재인증으로 토큰이 자꾸 만료되어,
--    콘솔에서 직접 실행 → CSV 다운로드 → 앱에 업로드하는 방식으로 전환)
--
-- 사용법:
--   1) 아래 START / END 날짜를 정산월로 수정 (예: 2026-06-01 / 2026-06-30)
--   2) 실행 → 결과 상단의 [결과 저장 ▸ CSV(다운로드)] 선택
--   3) 정산 앱 → COPYRIGHT → "사용량 CSV 업로드" 버튼으로 업로드
--
-- 출력 컬럼(앱이 인식): publisher, usedIsbn, bookName, userCount, unitPrice, status
-- 기준: 그 달에 '신규 등록'한 사용자만(삭제분 제외), publisher+isbn별 고유 사용자수.
-- ───────────────────────────────────────────────────────────────

DECLARE START_YYYYMMDD DATE DEFAULT DATE '2026-06-01';
DECLARE END_YYYYMMDD   DATE DEFAULT DATE '2026-06-30';

WITH base AS (
  SELECT
    l.*,
    c.status AS status,
    c.consumer_price AS consumerPrice,
    CASE
      WHEN b.publisher LIKE '%NE능률%'   THEN 'NE능률'
      WHEN b.publisher LIKE '%개념원리%' THEN '개념원리'
      WHEN b.publisher LIKE '%쎄듀%'     THEN '쎄듀'
      WHEN b.publisher LIKE '%지학사%'   THEN '지학사'
      WHEN b.publisher LIKE '%키출판사%' THEN '키출판사'
      WHEN b.publisher LIKE '%마더텅%'   THEN '마더텅'
      -- 수경출판사는 현재 정산 제외 (추후: WHEN b.publisher LIKE '%수경출판%' THEN '수경출판사')
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
  LEFT JOIN `mathpresso-data.qanda_rds_live.books`          b ON l.isbn = b.isbn
  LEFT JOIN `mathpresso-data.qanda_rds_live.book_contracts` c ON l.isbn = c.isbn
  WHERE l.deletedAt IS NULL
    AND l.registeredAt >= START_YYYYMMDD
    AND l.registeredAt <  DATE_ADD(END_YYYYMMDD, INTERVAL 1 DAY)
)
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
ORDER BY publisher, userCount DESC;
