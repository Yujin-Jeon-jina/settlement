# 출판사 정산 어드민 (settlement-admin)

출판사별 미니멈개런티(MG) 정산을 자동화하는 비밀번호 보호 어드민.
Next.js(App Router) + TypeScript + Prisma(Postgres) 기반, Railway 배포 대상.

## 핵심 흐름

1. **로그인** — `SETTLEMENT_PASSWORD` 입력 시에만 정산 메뉴 접근 (쿠키 세션).
2. **정산월 선택 → 사용량 불러오기** — BigQuery에서 사용 ISBN별 고유 사용자수 집계.
3. **매칭** — 사용 ISBN ↔ 계약 교재 매칭:
   - 저장된 확정 매핑 → ISBN 정확 일치(자동) → 제목 유사도 후보 추천(사람 확인).
   - 확정한 매핑은 Postgres에 저장되어 다음 달부터 재사용(수동 작업 누적 감소).
4. **결과** — 출판사별 요약/라인 표시, CSV 내보내기, 정산 이력 저장.
5. **(선택) 시트 자동 기록** — 쏠북 Summary / 출판사 폴더 시트 write-back (구조 확정 후 구현).

## 로컬 실행

```bash
cp .env.example .env   # 값 채우기 (없으면 USE_MOCK_DATA=true로 목업 동작)
npm install
npx prisma migrate dev   # DB 사용 시
npm run dev              # http://localhost:3000
```

`USE_MOCK_DATA=true`면 BigQuery/Sheets 자격증명 없이도 목업 데이터로 UI/계산을 확인할 수 있다.

## 실데이터 연동에 필요한 값 (`.env`)

- `SETTLEMENT_PASSWORD`, `SESSION_SECRET`
- `DATABASE_URL` (Railway Postgres)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — BigQuery 읽기 + Sheets/Drive 권한. 이 서비스계정 이메일을
  계약목록·쏠북Summary·출판사폴더에 **공유**해야 함.
- `BIGQUERY_PROJECT_ID`, `BIGQUERY_DATASET`, `BIGQUERY_USAGE_TABLE`
  또는 `BIGQUERY_USAGE_SQL` (bookips 데이터 커넥터의 SQL, `{{START_DATE}}`/`{{END_DATE}}` 치환).
- `CONTRACT_SHEET_ID`, `SUMMARY_SHEET_ID`, `PUBLISHER_FOLDER_ID` (기본값은 `.env.example` 참고).

## 구조

```
src/
  middleware.ts            인증 게이트
  lib/{auth,db,bigquery,google,matching,settlement,types,mock}.ts
  app/login/                로그인
  app/settlement/           메인 정산 화면
  app/api/{auth,usage,contracts,mappings,settlement,export}/
prisma/schema.prisma        IsbnMapping / SettlementRun / SettlementLine
```
