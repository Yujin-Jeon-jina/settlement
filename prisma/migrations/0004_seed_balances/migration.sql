-- 2026-05 기준 출판사별 MG 잔액 시드 (= 2026-06 전월잔액). 이미 있으면 유지.
INSERT INTO "PublisherBalance" ("publisher", "prevBalance", "updatedAt") VALUES
  ('개념원리',   19885397, CURRENT_TIMESTAMP),
  ('NE능률',     25865500, CURRENT_TIMESTAMP),
  ('쎄듀',       12515000, CURRENT_TIMESTAMP),
  ('마더텅',     -3921400, CURRENT_TIMESTAMP),
  ('키출판사',    6837000, CURRENT_TIMESTAMP),
  ('지학사',      3880000, CURRENT_TIMESTAMP)
ON CONFLICT ("publisher") DO NOTHING;
