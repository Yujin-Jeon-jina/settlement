# Railway 배포 가이드 (터미널 거의 불필요)

이 앱은 **Dockerfile**로 빌드되고, 시작 시 **DB 마이그레이션을 자동 적용**한 뒤 서버를 띄웁니다.
대부분 Railway 웹 화면에서 클릭/입력만으로 끝납니다.

## 1. 프로젝트 생성 + DB
1. https://railway.app → **New Project** → **Deploy from GitHub repo** → `Yujin-Jeon-jina/settlement` 선택
2. 브랜치: `claude/loving-goldberg-u9mfie` (또는 main 병합 후 main)
3. 같은 프로젝트에서 **New → Database → PostgreSQL** 추가
   - Railway가 `DATABASE_URL`을 자동 제공. 서비스 Variables에서 `${{Postgres.DATABASE_URL}}`로 참조하거나 값 복사.

## 2. 환경변수 (서비스 → Variables 에 입력)

| 변수 | 값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway Postgres |
| `SETTLEMENT_PASSWORD` | (원하는 비밀번호) | 정산 메뉴 진입 비번 |
| `SESSION_SECRET` | (긴 랜덤 문자열) | 세션 서명 |
| `USE_MOCK_DATA` | `false` | 실데이터 사용 |
| `BIGQUERY_PROJECT_ID` | `mathpresso-data` | BigQuery 프로젝트 |
| `CONTRACT_ACTIVE_STATUSES` | `ALLOWED` | 승인 status |
| `GOOGLE_OAUTH_CREDENTIALS` | (아래 참조) | 본인 계정 인증 JSON |

### GOOGLE_OAUTH_CREDENTIALS 만들기 (서비스계정 없이, 1회)
로컬에서 한 번만:
```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```
생성된 파일 내용을 통째로 복사해 변수에 붙여넣기:
- macOS/Linux: `~/.config/gcloud/application_default_credentials.json`
- 형식은 `{"client_id":...,"client_secret":...,"refresh_token":...,"type":"authorized_user"}`

> 시트 부가기능(피벗 자동대조·write-back)까지 쓰려면 위 로그인 scopes에
> `,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive` 추가.
> 핵심 정산(BigQuery)만 쓰면 cloud-platform 하나로 충분.

## 3. 배포 & 확인
- 변수 저장하면 Railway가 자동 빌드/배포. (Dockerfile 빌드 → `prisma migrate deploy` → 서버 기동)
- 발급된 도메인(`*.up.railway.app`) 접속 → 비밀번호 입력 → 정산월 선택 → "사용량 불러오기".
- 출판사별 합계가 bookips 피벗과 일치하는지 확인.

## 4. (선택) qandacx 어드민에 연결
기존 어드민의 사이드바 메뉴(예: Adjustment)에서 이 도메인으로 링크하거나 iframe 임베드.

## 트러블슈팅
- BigQuery 권한 오류: `GOOGLE_OAUTH_CREDENTIALS` 계정이 `mathpresso-data` 조회 권한이 있는지, `BIGQUERY_PROJECT_ID`가 맞는지 확인.
- 마이그레이션 오류: `DATABASE_URL`이 올바른지 확인. 로그는 Railway Deployments → 로그.
- 빈 화면/401: `SETTLEMENT_PASSWORD`, `SESSION_SECRET` 설정 여부 확인.
