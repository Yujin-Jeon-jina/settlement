# 출판사 정산 어드민 (settlement-admin)

출판사별 미니멈개런티(MG) 정산을 자동화하는 비밀번호 보호 어드민.
Next.js(App Router) + TypeScript + Prisma(Postgres), Railway 배포.

- 작업 브랜치: **`claude/loving-goldberg-u9mfie`**
- 배포: Railway (브라우저로 도메인 접속 → 비밀번호 로그인)

---

## 다른 컴퓨터에서 이어서 작업하기

```bash
# 1) 레포 받기 + 작업 브랜치
git clone https://github.com/Yujin-Jeon-jina/settlement.git
cd settlement
git checkout claude/loving-goldberg-u9mfie

# 2) 설치
npm install

# 3) 환경변수
cp .env.example .env      # 값 채우기 (아래 표 참고)
#   - 화면만 빠르게 보기: .env 에 USE_MOCK_DATA=true (자격증명 없이 목업 동작)

# 4) (실데이터를 로컬에서 볼 때) 본인 Google 계정 로그인 → BigQuery 권한
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform
#   생성된 ~/.config/gcloud/application_default_credentials.json 내용을
#   .env 의 GOOGLE_OAUTH_CREDENTIALS 에 통째로 붙여넣기

# 5) 실행
npm run dev               # http://localhost:3000
```

> **그냥 쓰기만** 할 거면 설치 필요 없음 — Railway 배포 도메인에 접속해 비밀번호만 입력.
> 계약목록·매핑은 DB에 저장돼 있어 그대로 유지됨.

---

## 핵심 흐름

1. **로그인** — `SETTLEMENT_PASSWORD` 입력 시에만 접근 (쿠키 세션).
2. **계약목록 등록(계약목록 탭)** — IP LIST를 **CSV로 업로드**(Postgres 저장). 정산 기준 + 단가.
3. **사용량 올리기** — 두 가지 경로:
   - **(기본) 사용량 CSV 업로드** — BigQuery 콘솔에서 `scripts/usage_export.sql`(정산월로 날짜 수정) 실행 →
     결과를 CSV로 다운로드 → "사용량 CSV 업로드" 버튼으로 올림. **서버측 Google 인증이 없어 토큰 만료(invalid_rapt) 안 남.**
     조직 정책상 서비스계정 불가 + OAuth 재인증이 잦아 이 방식을 기본으로 사용.
   - (보조) **라이브 조회** — BigQuery 직접 조회. 자격증명/토큰이 살아있을 때만 동작(조직 재인증 시 실패 가능).
   - 기준: `registered_at`이 정산월 안 + `deleted_at IS NULL`(삭제분 제외), 등록 사용자수.
   - CSV 헤더(한/영 별칭 허용): `publisher · usedIsbn(isbn) · bookName · userCount · unitPrice · status`.
     원시 로그(userHash 포함)도 업로드 가능 → publisher+isbn별 COUNT(DISTINCT userHash)로 자동 집계.
   - 단가/승인여부: **단가는 IP LIST bookPrice**, 승인 = `book_contracts.status=ALLOWED`.
4. **매칭** — 사용 교재 ↔ 계약 교재(IP LIST) 나란히 표시:
   - IP LIST ISBN 정확일치 + ALLOWED → 자동매칭.
   - 개정판 등: **알라딘 조회 / 계약목록 직접검색 / 직접입력 / 미허가**.
   - 확정/직접입력 매핑은 Postgres에 영구 저장 → 다음 달 자동 재사용(다시 안 물음).
   - 기존 bookips 매핑은 **교재매핑 탭에서 CSV 일괄 임포트** 가능.
5. **결과** — 출판사별 정산금액 실시간 집계, 정산/미허가 분리 보기, CSV 내보내기, 이력 저장.

---

## 환경변수 (`.env` / Railway Variables)

| 변수 | 설명 |
|---|---|
| `SETTLEMENT_PASSWORD` | 정산 메뉴 진입 비밀번호 |
| `SESSION_SECRET` | 세션 쿠키 서명용 랜덤 문자열 |
| `DATABASE_URL` | Postgres. Railway에선 `${{Postgres.DATABASE_URL}}` |
| `USE_MOCK_DATA` | `true`면 자격증명 없이 목업. 실데이터는 `false` |
| `GOOGLE_OAUTH_CREDENTIALS` | 본인 계정 ADC JSON(authorized_user). BigQuery 인증 |
| `BIGQUERY_PROJECT_ID` | `mathpresso-data` |
| `CONTRACT_ACTIVE_STATUSES` | 승인으로 볼 status (기본 `ALLOWED`) |
| `ALADIN_TTB_KEY` | (선택) 알라딘 ISBN 조회용 키 |

> 회사 Google 정책상 Sheets/Drive 스코프가 차단됨 → 시트 직접 읽기 대신 **CSV 업로드** 방식 사용.
> BigQuery는 `cloud-platform` 스코프만으로 동작. `@google-cloud/bigquery`의 node-fetch
> "Premature close" 회피를 위해 토큰/쿼리는 node `https` 기반 REST로 호출(`src/lib/bqrest.ts`).

---

## 데이터 소스

| 소스 | 역할 |
|---|---|
| BQ `mathpresso-data.qanda_rds_live.bookips_usage_logs` | 사용 이벤트 (registered_at/deleted_at) |
| BQ `...books` | 교재명/출판사 |
| BQ `...book_contracts` | 승인여부(status) |
| IP LIST 시트 → **CSV 업로드** | 계약 교재 마스터(ISBN/제목/단가) = 정산 기준 |

---

## 구조

```
src/
  middleware.ts                 인증 게이트
  lib/
    auth.ts                     비밀번호/세션(Edge 호환 HMAC)
    gcp.ts                      Google 자격증명(ADC) + IPv4/재시도
    bqrest.ts                   node https 기반 BigQuery REST + Sheets 읽기
    bigquery.ts                 사용량 집계 쿼리
    contracts.ts                계약목록(CSV 임포트/조회, Postgres)
    mappings.ts                 기존 ISBN 매핑 CSV 임포트
    aladin.ts                   알라딘 ISBN 조회
    matching.ts                 제목 정규화/유사도 후보 추천
    settlement.ts               매칭·정산 라인 생성
    db.ts / types.ts / mock.ts
  app/login/                    로그인
  app/settlement/page.tsx       메인 화면(정산/계약목록/교재매핑/정산이력 탭)
  app/api/
    auth/ usage/ contracts/ mappings/ settlement/ isbn-lookup/ export/
    (verify, netcheck, tokencheck = 임시 진단용 — 정리 예정)
prisma/schema.prisma            Contract / IsbnMapping / SettlementRun / SettlementLine
Dockerfile, railway.json        배포 (시작 시 prisma migrate deploy)
DEPLOY.md                       Railway 배포 가이드
```

---

## 남은 작업 (TODO)

- [ ] 재배포 후 "삭제분 제외" 반영된 사용목록이 피벗과 일치하는지 최종 확인
- [ ] 기존 bookips 매핑 CSV 임포트(교재매핑 탭)로 과거 구판/개정판 자동 적용
- [ ] `ALADIN_TTB_KEY` 설정 후 알라딘 조회 활용
- [ ] 수경출판사 추가 (`src/lib/bigquery.ts` DEFAULT_BASE_SQL 주석 처리한 한 줄 복구)
- [ ] 임시 진단 엔드포인트 제거 (`/api/auth` GET, `/api/netcheck`, `/api/tokencheck`)
- [ ] (선택) 쏠북 Summary / 출판사 폴더 시트 write-back

---

## 배포

`Dockerfile`로 빌드, 시작 시 `prisma migrate deploy` 후 기동. 자세한 절차는 `DEPLOY.md`.
변경 후 작업 브랜치로 `git push` → Railway 자동 재배포.
