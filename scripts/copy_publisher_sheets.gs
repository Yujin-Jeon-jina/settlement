/**
 * 출판사별 폴더에서 "전월 정산 시트"를 찾아 "이번 달" 사본을 자동 생성한다.
 *
 * 수작업(폴더마다 들어가 5월 사본 → 6월로 이름 변경)을 대체한다.
 *
 * 사용 방법 (둘 중 택1):
 *   A. script.google.com 에 새 프로젝트 생성 → 이 코드 붙여넣기 →
 *      함수 `createThisMonthSheets` 를 ▶ 실행 (최초 1회 Drive 권한 승인).
 *   B. 매월 1일 자동 실행: 함수 `installMonthlyTrigger` 를 한 번 실행해두면
 *      매월 1일 새벽에 자동으로 이번 달 시트를 만든다. (버튼 누를 필요 없음)
 *
 *   (선택) 컨트롤 스프레드시트에 붙이면 onOpen 메뉴 "📋 정산"에서 버튼처럼 실행 가능.
 *
 * 동작 규칙:
 *   - 폴더 안의 스프레드시트 제목에서 "YY.MM" 패턴을 읽어 가장 최근 월 시트를 찾는다.
 *   - 그 시트를 복사해 "YY.MM월_{출판사}_갱신계약(MG) 적용분" 이름으로 같은 폴더에 만든다.
 *   - 이번 달 시트가 이미 있으면 건너뛴다(중복 생성 방지).
 *   - 바로가기(shortcut)는 무시한다.
 */

// 출판사 → Drive 폴더 ID (settlement 앱의 PUBLISHER_FOLDER 와 동일)
var FOLDERS = {
  '개념원리':   '1LvoTT3pwBagRi7y_uLuAz2_UPAthFyRF',
  '쎄듀':       '1K6XTOrIXurRc32MgOykm-crmakGnGPg4',
  '마더텅':     '1xj0TwlFyTyLup7W_CIFKlvNFTRNcgw_q',
  '키출판사':   '1yl16gW8F4V4At44T3MuIiZ-sLkI11zC3',
  'NE능률':     '1zM2F93lcubgimfH0o1TgkofmarAPMCOO',
  '지학사':     '16RGGmgLy4blgiSYl2YnlXeAKF8R9k-x0',
  // '수경출판사': '...',  // 추후 폴더 ID 확보 시 추가
};

var TITLE_SUFFIX = '_갱신계약(MG) 적용분'; // 새 사본 이름 규칙

/** 오늘 날짜 기준 이번 달 시트 생성 (에디터에서 실행 / 트리거 대상) */
function createThisMonthSheets() {
  var now = new Date();
  return createMonthlySheets(now.getFullYear(), now.getMonth() + 1);
}

/** 특정 연/월 시트 생성. year=2026, month=6 형태. */
function createMonthlySheets(year, month) {
  var yy = String(year).slice(-2);
  var mm = ('0' + month).slice(-2);
  var log = [];

  Object.keys(FOLDERS).forEach(function (publisher) {
    var folder = DriveApp.getFolderById(FOLDERS[publisher]);
    var targetTitle = yy + '.' + mm + '월_' + publisher + TITLE_SUFFIX;

    if (findByTitle(folder, targetTitle)) {
      log.push('= ' + publisher + ': 이미 존재 (' + targetTitle + ')');
      return;
    }

    var latest = findLatestMonthlySheet(folder, year, month);
    if (!latest) {
      log.push('! ' + publisher + ': 복사할 이전 시트를 못 찾음');
      return;
    }

    var copy = latest.file.makeCopy(targetTitle, folder);
    log.push('+ ' + publisher + ': ' + latest.file.getName() + ' → ' + copy.getName());
  });

  var msg = log.join('\n');
  Logger.log(msg);
  return msg;
}

/** 폴더에서 제목이 정확히 일치하는 스프레드시트 1건 반환(없으면 null) */
function findByTitle(folder, title) {
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName() === title) return f;
  }
  return null;
}

/**
 * 폴더 내 스프레드시트 중 제목의 "YY.MM" 가 가장 최근인 것을 반환.
 * 대상 연/월(target)보다 같거나 큰 것은 후보에서 제외해, 새로 만든 이번 달 시트를
 * 원본으로 다시 복사하는 일을 막는다.
 */
function findLatestMonthlySheet(folder, targetYear, targetMonth) {
  var targetKey = targetYear * 100 + targetMonth;
  var best = null;
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    var f = it.next();
    var ym = parseYearMonth(f.getName());
    if (!ym) continue;
    if (ym.key >= targetKey) continue; // 이번 달 이후 시트는 원본 후보에서 제외
    if (!best || ym.key > best.key ||
        (ym.key === best.key && f.getDateCreated() > best.file.getDateCreated())) {
      best = { file: f, key: ym.key };
    }
  }
  return best;
}

/** 제목에서 "26.05" / "26_04" / "26.05월" 같은 패턴을 읽어 {year, month, key} 반환 */
function parseYearMonth(title) {
  var m = title.match(/(\d{2})[._](\d{2})/);
  if (!m) return null;
  var year = 2000 + parseInt(m[1], 10);
  var month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year: year, month: month, key: year * 100 + month };
}

/** 매월 1일 새벽 3시 자동 실행 트리거 설치 (한 번만 실행하면 됨) */
function installMonthlyTrigger() {
  // 중복 설치 방지: 기존 동일 트리거 제거
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'createThisMonthSheets') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('createThisMonthSheets')
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();
  Logger.log('매월 1일 03시 자동 실행 트리거를 설치했습니다.');
}

/** (선택) 컨트롤 시트에 붙였을 때 상단 메뉴 버튼 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 정산')
    .addItem('이번 달 출판사 시트 생성', 'createThisMonthSheets')
    .addToUi();
}
