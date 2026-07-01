"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { PublisherSummary, SettlementLineDraft } from "@/lib/types";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

function defaultMonthRange() {
  const now = new Date();
  // 매월 1~5일은 '지난달' 정산 기간으로 기본 설정(초순엔 전월분 정산이라 헷갈림 방지),
  // 6일부터는 당월 1일~말일.
  const monthOffset = now.getDate() <= 5 ? -1 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1); // 대상월 1일
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0); // 대상월 말일
  // 로컬 날짜 그대로 포맷 (toISOString의 UTC 변환으로 하루 밀리는 문제 방지)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  auto: { label: "자동매칭", color: "var(--teal)" },
  confirmed: { label: "확정", color: "var(--blue)" },
  unmatched: { label: "확인필요", color: "var(--orange)" },
  unauthorized: { label: "미허가", color: "var(--purple)" },
};

// 드라이브 바로가기 (고정 ID)
const DRIVE = {
  publishersRoot: "https://drive.google.com/drive/folders/1apAeN4WDIQlXmfkEtQx5nzfBj5hH_5gr",
  ipList: "https://docs.google.com/spreadsheets/d/1xrC3seWM8FH-MnpvE06shsbKKZOcAoIprIpboOiKQos",
  bookips: "https://docs.google.com/spreadsheets/d/1xtT0DcS8A3lGCSZPcpvggo4pzZhmF2w1QWeIEo_BNVU",
  summary: "https://docs.google.com/spreadsheets/d/1u18mFtPXz84Yx0vgyu4w0RvxVf2lL0CF_Cz0PCYHdcw",
};
const PUBLISHER_FOLDER: Record<string, string> = {
  개념원리: "https://drive.google.com/drive/folders/1LvoTT3pwBagRi7y_uLuAz2_UPAthFyRF",
  쎄듀: "https://drive.google.com/drive/folders/1K6XTOrIXurRc32MgOykm-crmakGnGPg4",
  마더텅: "https://drive.google.com/drive/folders/1xj0TwlFyTyLup7W_CIFKlvNFTRNcgw_q",
  키출판사: "https://drive.google.com/drive/folders/1yl16gW8F4V4At44T3MuIiZ-sLkI11zC3",
  NE능률: "https://drive.google.com/drive/folders/1zM2F93lcubgimfH0o1TgkofmarAPMCOO",
  지학사: "https://drive.google.com/drive/folders/16RGGmgLy4blgiSYl2YnlXeAKF8R9k-x0",
};

type Tab = "settlement" | "contracts" | "mapping" | "history";

export default function SettlementPage() {
  const router = useRouter();
  const def = useMemo(defaultMonthRange, []);
  const [tab, setTab] = useState<Tab>("settlement");
  const [startDate, setStartDate] = useState(def.start);
  const [endDate, setEndDate] = useState(def.end);
  const [lines, setLines] = useState<SettlementLineDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePublisher, setActivePublisher] = useState("전체");
  const [savedMsg, setSavedMsg] = useState("");
  const [verify, setVerify] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);

  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/contracts").then((r) => r.json()).then((j) => setContracts(j.contracts || [])).catch(() => {});
    fetch("/api/balances").then((r) => r.json()).then((j) => setBalances(j.balances || {})).catch(() => {});
  }, []);

  function setBalanceLocal(publisher: string, prevBalance: number) {
    setBalances((prev) => ({ ...prev, [publisher]: prevBalance }));
  }
  async function saveBalance(publisher: string, prevBalance: number) {
    setBalances((prev) => ({ ...prev, [publisher]: prevBalance }));
    try {
      const res = await fetch("/api/balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publisher, prevBalance }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`잔액 저장 실패 (${publisher}): ${j.error || res.status}`);
      } else {
        setError("");
      }
    } catch (e) {
      setError(`잔액 저장 실패 (${publisher}): ${String(e)}`);
    }
  }
  const contractById = useMemo(() => {
    const m = new Map<string, any>();
    contracts.forEach((c) => m.set(c.isbn, c));
    return m;
  }, [contracts]);

  async function load() {
    setLoading(true);
    setError("");
    setSavedMsg("");
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "불러오기 실패");
      return;
    }
    const j = await res.json();
    setLines(j.lines);
    setActivePublisher("전체");
  }

  // BigQuery에서 내보낸 사용량 CSV 업로드 → 서버에서 매칭/요약 (토큰 만료 없음)
  async function loadCsv(csv: string) {
    setLoading(true);
    setError("");
    setSavedMsg("");
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "CSV 불러오기 실패");
      return;
    }
    const j = await res.json();
    setLines(j.lines);
    setActivePublisher("전체");
  }

  function updateLine(usedIsbn: string, patch: Partial<SettlementLineDraft>) {
    setLines((prev) => prev.map((l) => (l.usedIsbn === usedIsbn ? { ...l, ...patch } : l)));
  }

  async function confirmMatch(line: SettlementLineDraft, contractIsbn: string) {
    const cand = line.candidates.find((c) => c.contractIsbn === contractIsbn);
    const c = contractById.get(contractIsbn);
    const unitPrice = cand?.bookPrice ?? c?.bookPrice ?? 0;
    const title = cand?.title ?? c?.title ?? null;
    updateLine(line.usedIsbn, {
      matchStatus: "confirmed",
      contractIsbn,
      contractBookName: title,
      unitPrice,
      amount: unitPrice * line.userCount,
    });
    await fetch("/api/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usedIsbn: line.usedIsbn,
        contractIsbn,
        publisher: line.publisher,
        bookName: line.bookName,
        status: "confirmed",
      }),
    });
  }

  async function lookupIsbn(line: SettlementLineDraft) {
    const res = await fetch("/api/isbn-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn: line.usedIsbn, usedTitle: line.bookName, publisher: line.publisher }),
    });
    return res.json();
  }

  async function manualMatch(
    line: SettlementLineDraft,
    m: { isbn: string; title: string; publisher: string; bookPrice: number }
  ) {
    await fetch("/api/contracts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    setContracts((prev) => [...prev.filter((c) => c.isbn !== m.isbn), m]);
    updateLine(line.usedIsbn, {
      matchStatus: "confirmed",
      contractIsbn: m.isbn,
      contractBookName: m.title,
      unitPrice: m.bookPrice,
      amount: m.bookPrice * line.userCount,
    });
    await fetch("/api/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usedIsbn: line.usedIsbn,
        contractIsbn: m.isbn,
        publisher: line.publisher,
        bookName: line.bookName,
        status: "confirmed",
      }),
    });
  }

  async function markUnauthorized(line: SettlementLineDraft) {
    updateLine(line.usedIsbn, { matchStatus: "unauthorized", contractIsbn: null, unitPrice: 0, amount: 0 });
    await fetch("/api/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usedIsbn: line.usedIsbn,
        publisher: line.publisher,
        bookName: line.bookName,
        status: "unauthorized",
      }),
    });
  }

  async function runVerify() {
    setVerifying(true);
    setVerify(null);
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    setVerifying(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setVerify({ error: j.error || "대조 실패" });
      return;
    }
    setVerify(j);
  }

  async function save() {
    const res = await fetch("/api/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, lines }),
    });
    setSavedMsg(res.ok ? "정산 이력이 저장되었습니다." : "저장 실패 (DB 연결 확인 필요)");
  }

  function exportCsv() {
    const header = ["출판사", "사용ISBN", "교재명", "사용자수", "단가", "금액", "상태", "계약ISBN"];
    const rows = lines.map((l) => [
      l.publisher,
      l.usedIsbn,
      `"${l.bookName.replace(/"/g, '""')}"`,
      l.userCount,
      l.unitPrice,
      l.amount,
      STATUS_META[l.matchStatus]?.label ?? l.matchStatus,
      l.contractIsbn ?? "",
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  // 출판사별 요약은 현재 lines에서 실시간 계산 (매칭/확정 시 즉시 갱신)
  const summary: PublisherSummary[] = useMemo(() => {
    const m = new Map<string, PublisherSummary>();
    for (const l of lines) {
      const s = m.get(l.publisher) ?? { publisher: l.publisher, totalAmount: 0, lineCount: 0, unauthorizedAmount: 0, totalUsers: 0 };
      s.lineCount += 1;
      s.totalAmount += l.amount;
      if (l.matchStatus === "auto" || l.matchStatus === "confirmed") s.totalUsers += l.userCount;
      if (l.matchStatus === "unauthorized" || l.matchStatus === "unmatched") s.unauthorizedAmount += 1;
      m.set(l.publisher, s);
    }
    return Array.from(m.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [lines]);

  const publishers = ["전체", ...summary.map((s) => s.publisher)];
  const visibleLines =
    activePublisher === "전체" ? lines : lines.filter((l) => l.publisher === activePublisher);
  const grandTotal = summary.reduce((a, s) => a + s.totalAmount, 0);
  const settledTypes = summary.reduce((a, s) => a + (s.lineCount - s.unauthorizedAmount), 0);
  const totalRegistrations = summary.reduce((a, s) => a + s.totalUsers, 0);
  const needAttention = lines.filter((l) => l.matchStatus === "unmatched").length;

  const TABS: { id: Tab; label: string }[] = [
    { id: "settlement", label: "정산" },
    { id: "contracts", label: "계약목록" },
    { id: "mapping", label: "교재매핑" },
    { id: "history", label: "정산이력" },
  ];

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-7">
        {/* 타이틀 + 로그아웃 */}
        <div className="flex items-start justify-between">
          <h1 className="page-title">COPYRIGHT</h1>
          <button onClick={logout} className="text-[12px] text-[var(--muted)] hover:text-[var(--text)]">
            로그아웃
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-6 mt-5 border-b border-[var(--border)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "pb-2.5 -mb-px text-[14px]",
                tab === t.id
                  ? "text-[var(--ink)] font-semibold border-b-2 border-[var(--teal)]"
                  : "text-[var(--muted)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "settlement" && (
          <SettlementTab
            {...{
              startDate,
              endDate,
              setStartDate,
              setEndDate,
              load,
              loadCsv,
              loading,
              error,
              savedMsg,
              summary,
              lines,
              visibleLines,
              publishers,
              activePublisher,
              setActivePublisher,
              grandTotal,
              settledTypes,
              totalRegistrations,
              needAttention,
              exportCsv,
              save,
              confirmMatch,
              markUnauthorized,
              runVerify,
              verifying,
              verify,
              contracts,
              lookupIsbn,
              manualMatch,
              balances,
              setBalanceLocal,
              saveBalance,
            }}
          />
        )}
        {tab === "contracts" && <ContractsTab />}
        {tab === "mapping" && <MappingTab />}
        {tab === "history" && <HistoryTab />}
      </main>
    </div>
  );
}

/* ───────────────── 정산 탭 ───────────────── */
function SettlementTab(p: any) {
  const [view, setView] = useState<"all" | "settle" | "unauth">("all");
  const [savedPub, setSavedPub] = useState<string | null>(null);
  const doSaveBalance = (publisher: string, value: number) => {
    p.saveBalance(publisher, value);
    setSavedPub(publisher);
    setTimeout(() => setSavedPub((cur) => (cur === publisher ? null : cur)), 1500);
  };
  const all = p.visibleLines as SettlementLineDraft[];
  const isSettled = (l: SettlementLineDraft) => l.matchStatus === "auto" || l.matchStatus === "confirmed";
  const isUnauth = (l: SettlementLineDraft) => l.matchStatus === "unauthorized" || l.matchStatus === "unmatched";
  const rows = all.filter((l) => (view === "all" ? true : view === "settle" ? isSettled(l) : isUnauth(l)));
  const settleCount = all.filter(isSettled).length;
  const unauthCount = all.filter(isUnauth).length;

  // 출판사별 정산 시트 CSV (출판사 폴더 시트 양식: 정산기간/출판사/isbn/교재명/등록교재수/정가/정산금액 + 합계)
  function exportPublisherSheet(publisher: string) {
    const period = (p.startDate || "").slice(0, 7); // YYYY-MM
    const lines = (p.lines as SettlementLineDraft[])
      .filter((l) => l.publisher === publisher && (l.matchStatus === "auto" || l.matchStatus === "confirmed") && l.amount > 0)
      .sort((a, b) => b.userCount - a.userCount);
    const cell = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["정산 기간", "출판사", "isbn", "교재명", "등록 교재 수", "교재 정가", "정산 금액"];
    const body = lines.map((l, i) => [
      i === 0 ? period : "",
      publisher,
      l.contractIsbn || l.usedIsbn,
      l.contractBookName || l.bookName,
      l.userCount,
      l.unitPrice,
      l.amount,
    ]);
    const totalCount = lines.reduce((a, l) => a + l.userCount, 0);
    const totalAmount = lines.reduce((a, l) => a + l.amount, 0);
    const sumRow = ["", "", "", "합계", totalCount, "", totalAmount];
    const prev = Number(p.balances?.[publisher] ?? 0);
    const ledger = [
      [],
      ["", "", "", "전월 MG 잔액", "", "", prev],
      ["", "", "", "당월 사용액", "", "", -totalAmount],
      ["", "", "", "사용분 제외 잔여금액", "", "", prev - totalAmount],
    ];
    const csv = "﻿" + [header, ...body, sumRow, ...ledger].map((r) => r.map(cell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${period}_${publisher}_정산.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* 드라이브 바로가기 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="text-[var(--muted)]">바로가기:</span>
        <a href={DRIVE.ipList} target="_blank" rel="noreferrer" className="text-[var(--blue)] underline">계약목록(IP LIST)</a>
        <a href={DRIVE.bookips} target="_blank" rel="noreferrer" className="text-[var(--blue)] underline">bookips(Pivot)</a>
        <a href={DRIVE.summary} target="_blank" rel="noreferrer" className="text-[var(--blue)] underline">쏠북 Summary</a>
        <a href={DRIVE.publishersRoot} target="_blank" rel="noreferrer" className="text-[var(--blue)] underline">출판사 폴더</a>
      </div>

      {/* 요약 한 줄 */}
      <div className="mt-3 text-[12px] text-[var(--muted)]">
        {p.lines.length > 0 ? (
          <>
            전체 합계 <b className="text-[var(--ink)]">{won(p.grandTotal)}</b>
            {" · "}교재 {p.settledTypes}종
            {" · "}총 등록 {p.totalRegistrations}건
            {p.needAttention > 0 && (
              <span className="text-[var(--orange)]"> · 확인필요 {p.needAttention}건</span>
            )}
          </>
        ) : (
          "정산월을 선택하고 사용량을 불러오세요."
        )}
      </div>

      {/* 정산월 + 액션 */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input type="date" value={p.startDate} onChange={(e: any) => p.setStartDate(e.target.value)}
          className="border border-[var(--border-strong)] rounded-md px-2.5 py-1.5 text-[13px]" />
        <span className="text-[var(--muted)]">~</span>
        <input type="date" value={p.endDate} onChange={(e: any) => p.setEndDate(e.target.value)}
          className="border border-[var(--border-strong)] rounded-md px-2.5 py-1.5 text-[13px]" />

        {/* 기본 경로: BigQuery 결과 CSV 업로드 (서버 인증 불필요 → 토큰 만료 없음) */}
        <label className={[
          "rounded-md px-3.5 py-1.5 text-[13px] font-medium cursor-pointer",
          p.loading ? "bg-[var(--ink)] opacity-60 text-white" : "bg-[var(--ink)] text-white",
        ].join(" ")}>
          {p.loading ? "처리 중…" : "사용량 CSV 업로드"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={p.loading}
            onChange={(e: any) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => { p.loadCsv(String(reader.result || "")); };
              reader.readAsText(f, "utf-8");
              e.target.value = ""; // 같은 파일 재선택 허용
            }}
          />
        </label>

        {/* 라이브 BigQuery 조회는 토큰 만료(invalid_rapt)가 잦아 UI에서 숨김.
            필요 시 p.load 로 재노출 가능. 기본 경로는 CSV 업로드. */}

        {p.lines.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={p.save}
              className="rounded-md px-3 py-1.5 text-[13px] border border-[var(--border-strong)] text-[var(--text)]">
              이력 저장
            </button>
            <button onClick={p.exportCsv} className="text-[13px] text-[var(--blue)] font-medium">⬇ CSV</button>
          </div>
        )}
      </div>

      {/* CSV 업로드 안내 */}
      <div className="mt-2 text-[11px] text-[var(--muted)]">
        BigQuery 콘솔에서 <code className="text-[var(--text)]">scripts/usage_export.sql</code>(정산월로 날짜 수정) 실행 →
        결과를 <b className="text-[var(--text)]">CSV 다운로드</b> 후 위 <b className="text-[var(--text)]">사용량 CSV 업로드</b>로 올리세요.
        필요한 컬럼: publisher · usedIsbn · bookName · userCount · unitPrice · status.
      </div>

      {p.error && <Banner color="var(--red)">{p.error}</Banner>}
      {p.savedMsg && <Banner color="var(--blue)">{p.savedMsg}</Banner>}

      {/* 출판사 필터 pill */}
      {p.summary.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-5">
          {p.publishers.map((pub: string) => {
            const s = p.summary.find((x: PublisherSummary) => x.publisher === pub);
            const count = pub === "전체" ? p.lines.length : s?.lineCount ?? 0;
            const active = p.activePublisher === pub;
            return (
              <button key={pub} onClick={() => p.setActivePublisher(pub)}
                className={[
                  "rounded-full px-3 py-1 text-[12px] font-medium",
                  active ? "bg-[var(--ink)] text-white" : "bg-[#f3f4f6] text-[#6b7280]",
                ].join(" ")}>
                {pub} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* 출판사별 정산금액 + MG잔액 + 시트 CSV */}
      {p.summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          {p.summary.map((s: PublisherSummary) => {
            const prev = Number(p.balances?.[s.publisher] ?? 0);
            const remain = prev - s.totalAmount;
            return (
              <div key={s.publisher} className="rounded-lg p-3 bg-[#fafafa] border border-[#d1d5db] border-l-4 border-l-[var(--orange)] shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-[var(--ink)]">{s.publisher}</span>
                  <span className="flex items-center gap-2">
                    {PUBLISHER_FOLDER[s.publisher] && (
                      <a href={PUBLISHER_FOLDER[s.publisher]} target="_blank" rel="noreferrer"
                        className="text-[11px] text-[var(--blue)] underline">📁 폴더</a>
                    )}
                    <button onClick={() => exportPublisherSheet(s.publisher)}
                      className="text-[11px] text-[var(--blue)] underline">⬇ 시트 CSV</button>
                  </span>
                </div>
                <div className="text-[18px] font-bold text-[var(--ink)] mt-1">{won(s.totalAmount)}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  당월 사용액 · 교재 {s.lineCount - s.unauthorizedAmount}종 · 총 등록 {s.totalUsers}건
                </div>

                <div className="mt-2 pt-2 border-t border-[var(--border)] text-[12px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--muted)]">전월 MG 잔액</span>
                    <span className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={p.balances?.[s.publisher] != null ? Number(p.balances[s.publisher]).toLocaleString() : ""}
                        onChange={(e) => p.setBalanceLocal(s.publisher, Number(e.target.value.replace(/[^0-9-]/g, "")) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") doSaveBalance(s.publisher, Number((e.target as HTMLInputElement).value.replace(/[^0-9-]/g, "")) || 0);
                        }}
                        placeholder="입력"
                        className="w-32 border border-[var(--border)] rounded px-2 py-0.5 text-right mono"
                      />
                      <button
                        onClick={() => doSaveBalance(s.publisher, Number(p.balances?.[s.publisher] ?? 0))}
                        className="text-[11px] px-1.5 py-0.5 rounded border border-[var(--border-strong)] text-[var(--text)]">
                        저장
                      </button>
                      {savedPub === s.publisher && <span className="text-[11px] text-[var(--teal)]">✓</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">잔여금액</span>
                    <span className="flex items-center gap-2">
                      <span className="mono font-medium" style={{ color: remain < 0 ? "var(--red)" : "var(--ink)" }}>
                        {remain.toLocaleString()}원
                      </span>
                      <button onClick={() => doSaveBalance(s.publisher, remain)}
                        title="이 잔여금액을 다음 달 전월잔액으로 저장(이월)"
                        className="text-[10px] text-[var(--blue)] underline">이월</button>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 보기 필터: 정산 대상 / 미허가 분리 */}
      {p.lines.length > 0 && (
        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {[
            { id: "all", label: `전체 ${all.length}` },
            { id: "settle", label: `정산 대상 ${settleCount}` },
            { id: "unauth", label: `미허가 ${unauthCount}` },
          ].map((v) => (
            <button key={v.id} onClick={() => setView(v.id as any)}
              className={[
                "px-3 py-1 text-[12px] rounded-md border",
                view === v.id
                  ? "border-[var(--orange)] text-[var(--orange)] font-medium bg-[#fff7f0]"
                  : "border-[var(--border-strong)] text-[var(--muted)]",
              ].join(" ")}>
              {v.label}
            </button>
          ))}
          {view === "unauth" && (
            <span className="ml-2 text-[11px] text-[var(--muted)]">
              ※ 미허가(비계약·DENIED·EXPIRED)는 정산 금액에서 제외되며, 사용 현황 확인용 목록입니다.
            </span>
          )}
        </div>
      )}

      {/* 테이블 */}
      {p.lines.length > 0 && (
        <div className="mt-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[var(--muted)] text-[12px] border-b border-[var(--border-strong)]">
                <Th>출판사</Th>
                <Th>사용 교재 (실제 사용)</Th>
                <Th>계약 교재 (매칭 대상)</Th>
                <Th className="text-right">사용자수</Th>
                <Th className="text-right">단가</Th>
                <Th className="text-right">금액</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l: SettlementLineDraft) => {
                const meta = STATUS_META[l.matchStatus];
                const matched = l.matchStatus === "auto" || l.matchStatus === "confirmed";
                return (
                  <tr key={l.usedIsbn} className="border-b border-[var(--border)] align-top">
                    <td className="py-3 pr-3 whitespace-nowrap">{l.publisher}</td>

                    {/* 사용 교재 */}
                    <td className="py-3 pr-3 max-w-[320px]">
                      <div className="text-[var(--text)]">{l.bookName}</div>
                      <div className="mono text-[11px] text-[var(--muted)]">{l.usedIsbn}</div>
                    </td>

                    {/* 계약 교재 / 매칭 */}
                    <td className="py-3 pr-3 max-w-[380px]">
                      <span className="inline-block text-[11px] font-medium mb-1" style={{ color: meta.color }}>
                        ● {meta.label}
                      </span>

                      {matched && (
                        <>
                          <div className="text-[var(--text)]">{l.contractBookName || "(이름 없음)"}</div>
                          <div className="mono text-[11px] text-[var(--muted)]">{l.contractIsbn}</div>
                        </>
                      )}

                      {l.matchStatus === "unauthorized" && (
                        <div className="text-[12px] text-[var(--muted)]">미허가 처리됨 (정산 제외)</div>
                      )}

                      {l.matchStatus === "unmatched" && (
                        <div className="space-y-1">
                          {l.contractStatus && (
                            <div className="text-[11px] text-[var(--muted)]">
                              계약상태 <span className="mono">{l.contractStatus}</span>
                              {l.contractStatus === "EXPIRED" && " (계약 종료)"}
                              {l.contractStatus === "DENIED" && " (미승인)"}
                            </div>
                          )}
                          {l.candidates.length === 0 && (
                            <div className="text-[12px] text-[var(--muted)]">추천 후보 없음</div>
                          )}
                          {l.candidates.map((c) => (
                            <button key={c.contractIsbn} onClick={() => p.confirmMatch(l, c.contractIsbn)}
                              className="block w-full text-left border border-[var(--border-strong)] rounded-md px-2.5 py-1.5 hover:border-[var(--orange)]">
                              <span className="text-[12px]">{c.title}</span>
                              <span className="mono text-[11px] text-[var(--muted)] ml-1">
                                · {c.bookPrice.toLocaleString()}원 · 유사도 {(c.score * 100).toFixed(0)}%
                              </span>
                            </button>
                          ))}
                          <MatchTools
                            line={l}
                            contracts={p.contracts || []}
                            onPick={(isbn: string) => p.confirmMatch(l, isbn)}
                            onLookup={() => p.lookupIsbn(l)}
                            onManual={(m: any) => p.manualMatch(l, m)}
                            onUnauthorized={() => p.markUnauthorized(l)}
                          />
                        </div>
                      )}
                    </td>

                    <td className="py-3 pr-3 text-right mono">{l.userCount}</td>
                    <td className="py-3 pr-3 text-right mono">{l.unitPrice ? l.unitPrice.toLocaleString() : "-"}</td>
                    <td className="py-3 pr-3 text-right mono font-semibold text-[var(--ink)]">
                      {l.amount ? l.amount.toLocaleString() : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[12px] text-[var(--muted)] mt-4">총 {rows.length}건</div>
        </div>
      )}
    </>
  );
}

/* ───────────────── 계약목록 탭 (IP LIST CSV 업로드) ───────────────── */
function ContractsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    fetch("/api/contracts").then((r) => r.json()).then((j) => setRows(j.contracts || []));
  }
  useEffect(reload, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setCsv(String(r.result || ""));
    r.readAsText(f, "utf-8");
  }

  async function importCsv() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(`계약목록 ${j.count}건 등록 완료`);
      setCsv("");
      reload();
    } else {
      setMsg(j.error || "등록 실패");
    }
  }

  return (
    <div className="mt-5">
      <div className="text-[12px] text-[var(--muted)] mb-3">
        IP LIST(계약목록) 시트를 <b>CSV로 내려받아</b> 붙여넣거나 업로드하세요. 정산의 계약 기준이 됩니다.
        컬럼 순서: <span className="mono">ISBN, 출판사, 교재명, 단가, 시작일, 종료일</span>. (계약이 바뀔 때만 갱신)
      </div>

      <div className="rounded-md border border-[var(--border-strong)] p-3 mb-4">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="여기에 CSV 내용을 붙여넣기…"
          className="w-full h-32 border border-[var(--border)] rounded-md p-2 text-[12px] mono outline-none focus:border-[var(--orange)]"
        />
        <div className="flex items-center gap-3 mt-2">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[12px]" />
          <button onClick={importCsv} disabled={busy || !csv.trim()}
            className="rounded-md px-3.5 py-1.5 text-[13px] font-medium bg-[var(--ink)] text-white disabled:opacity-50">
            {busy ? "등록 중…" : "계약목록 등록"}
          </button>
          {msg && <span className="text-[12px] text-[var(--blue)]">{msg}</span>}
        </div>
      </div>

      <div className="text-[12px] text-[var(--muted)] mb-2">현재 등록된 계약 교재: {rows.length}건</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[var(--muted)] text-[12px] border-b border-[var(--border-strong)]">
            <Th>출판사</Th><Th>교재명</Th><Th>ISBN</Th><Th className="text-right">단가</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((r) => (
            <tr key={r.isbn} className="border-b border-[var(--border)]">
              <td className="py-2 pr-3 whitespace-nowrap">{r.publisher}</td>
              <td className="py-2 pr-3">{r.title}</td>
              <td className="py-2 pr-3 mono text-[12px]">{r.isbn}</td>
              <td className="py-2 pr-3 text-right mono">{(r.bookPrice || 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && <div className="text-[11px] text-[var(--muted)] mt-2">… 외 {rows.length - 500}건</div>}
    </div>
  );
}

/* ───────────────── 교재매핑 탭 ───────────────── */
function MappingTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    fetch("/api/mappings").then((r) => r.json()).then((j) => {
      setRows(j.mappings || []);
      setLoaded(true);
    });
  }
  useEffect(reload, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setCsv(String(r.result || ""));
    r.readAsText(f, "utf-8");
  }
  async function importCsv() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/mappings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(`매핑 ${j.count}건 등록 완료`);
      setCsv("");
      reload();
    } else setMsg(j.error || "등록 실패");
  }

  async function remove(usedIsbn: string) {
    await fetch(`/api/mappings?usedIsbn=${encodeURIComponent(usedIsbn)}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.usedIsbn !== usedIsbn));
  }
  return (
    <div className="mt-5">
      <div className="text-[12px] text-[var(--muted)] mb-3">
        확정한 사용 ISBN ↔ 계약 교재 매핑. 저장된 매핑은 다음 달 정산에 자동 적용됩니다.
      </div>

      {/* 기존 bookips 매핑 CSV 임포트 */}
      <div className="rounded-md border border-[var(--border-strong)] p-3 mb-4">
        <div className="text-[12px] text-[var(--muted)] mb-2">
          기존 매핑(bookips 등)을 CSV로 한 번에 등록 → 과거 구판/개정판 연결이 자동 적용됩니다.
          컬럼 순서: <span className="mono">사용ISBN, 계약ISBN, (출판사), (교재명)</span>
        </div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="사용ISBN,계약ISBN,... 붙여넣기…"
          className="w-full h-24 border border-[var(--border)] rounded-md p-2 text-[12px] mono outline-none focus:border-[var(--orange)]" />
        <div className="flex items-center gap-3 mt-2">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[12px]" />
          <button onClick={importCsv} disabled={busy || !csv.trim()}
            className="rounded-md px-3.5 py-1.5 text-[13px] font-medium bg-[var(--ink)] text-white disabled:opacity-50">
            {busy ? "등록 중…" : "매핑 일괄 등록"}
          </button>
          {msg && <span className="text-[12px] text-[var(--blue)]">{msg}</span>}
        </div>
      </div>

      <div className="text-[12px] text-[var(--muted)] mb-2">등록된 매핑: {rows.length}건</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[var(--muted)] text-[12px] border-b border-[var(--border-strong)]">
            <Th>출판사</Th><Th>교재명</Th><Th>사용 ISBN</Th><Th>계약 ISBN</Th><Th>상태</Th><Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.usedIsbn} className="border-b border-[var(--border)]">
              <td className="py-3 pr-3">{r.publisher}</td>
              <td className="py-3 pr-3">{r.bookName}</td>
              <td className="py-3 pr-3 mono text-[12px]">{r.usedIsbn}</td>
              <td className="py-3 pr-3 mono text-[12px]">{r.contractIsbn || "-"}</td>
              <td className="py-3 pr-3 text-[12px]">{r.status === "unauthorized" ? "미허가" : "확정"}</td>
              <td className="py-3"><button onClick={() => remove(r.usedIsbn)} className="text-[12px] text-[var(--muted)] hover:text-[var(--red)]">삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {loaded && rows.length === 0 && (
        <div className="text-center text-[var(--muted)] py-16 text-[13px]">저장된 매핑이 없습니다.</div>
      )}
    </div>
  );
}

/* ───────────────── 정산이력 탭 ───────────────── */
function HistoryTab() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({}); // runId -> run(with lines)
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settlement").then((r) => r.json()).then((j) => {
      setRuns(j.runs || []);
      setLoaded(true);
    });
  }, []);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detail[id]) {
      setLoadingId(id);
      try {
        const j = await fetch(`/api/settlement/${id}`).then((r) => r.json());
        if (j.run) setDetail((prev) => ({ ...prev, [id]: j.run }));
      } finally {
        setLoadingId(null);
      }
    }
  }

  return (
    <div className="mt-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[var(--muted)] text-[12px] border-b border-[var(--border-strong)]">
            <Th></Th><Th>정산기간</Th><Th>상태</Th><Th className="text-right">라인수</Th><Th>생성일시</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const d = detail[r.id];
            const isOpen = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr onClick={() => toggle(r.id)} className="border-b border-[var(--border)] cursor-pointer hover:bg-[#fafafa]">
                  <td className="py-3 pr-2 text-[var(--muted)]">{isOpen ? "▾" : "▸"}</td>
                  <td className="py-3 pr-3 mono text-[12px]">
                    {String(r.periodStart).slice(0, 10)} ~ {String(r.periodEnd).slice(0, 10)}
                  </td>
                  <td className="py-3 pr-3 text-[12px]" style={{ color: "var(--teal)" }}>{r.status}</td>
                  <td className="py-3 pr-3 text-right mono">{r._count?.lines ?? "-"}</td>
                  <td className="py-3 pr-3 mono text-[12px]">{String(r.createdAt).slice(0, 19).replace("T", " ")}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-[var(--border)]">
                    <td colSpan={5} className="bg-[#fafafa] px-3 py-3">
                      {loadingId === r.id && <div className="text-[12px] text-[var(--muted)]">불러오는 중…</div>}
                      {d && <RunDetail run={d} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {loaded && runs.length === 0 && (
        <div className="text-center text-[var(--muted)] py-16 text-[13px]">저장된 정산 이력이 없습니다.</div>
      )}
    </div>
  );
}

/** 이력 1건의 라인 상세 (출판사별 소계 + 전체 라인 표) */
function RunDetail({ run }: { run: any }) {
  const lines: any[] = run.lines || [];
  const byPub = new Map<string, { amount: number; count: number; users: number }>();
  for (const l of lines) {
    const settled = l.matchStatus === "auto" || l.matchStatus === "confirmed";
    const s = byPub.get(l.publisher) ?? { amount: 0, count: 0, users: 0 };
    s.amount += l.amount; s.count += 1; if (settled) s.users += l.userCount;
    byPub.set(l.publisher, s);
  }
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {Array.from(byPub.entries()).map(([pub, s]) => (
          <span key={pub} className="text-[12px] border border-[var(--border-strong)] rounded-md px-2 py-1">
            <b>{pub}</b> {s.amount.toLocaleString()}원 · {s.users}건
          </span>
        ))}
        <span className="text-[12px] rounded-md px-2 py-1 bg-[var(--ink)] text-white">전체 {total.toLocaleString()}원</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
            <Th>출판사</Th><Th>교재명</Th><Th>사용ISBN</Th><Th>계약ISBN</Th>
            <Th className="text-right">등록</Th><Th className="text-right">단가</Th><Th className="text-right">금액</Th><Th>상태</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-[var(--border)]">
              <td className="py-2 pr-3">{l.publisher}</td>
              <td className="py-2 pr-3">{l.bookName}</td>
              <td className="py-2 pr-3 mono">{l.usedIsbn}</td>
              <td className="py-2 pr-3 mono">{l.contractIsbn || "-"}</td>
              <td className="py-2 pr-3 text-right mono">{l.userCount}</td>
              <td className="py-2 pr-3 text-right mono">{l.unitPrice.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right mono">{l.amount.toLocaleString()}</td>
              <td className="py-2 pr-3">{STATUS_META[l.matchStatus]?.label ?? l.matchStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────── 확인필요 매칭 도구 (알라딘 조회 / 직접검색 / 직접입력 / 미허가) ───────────────── */
function MatchTools({
  line,
  contracts,
  onPick,
  onLookup,
  onManual,
  onUnauthorized,
}: {
  line: SettlementLineDraft;
  contracts: any[];
  onPick: (isbn: string) => void;
  onLookup: () => Promise<any>;
  onManual: (m: { isbn: string; title: string; publisher: string; bookPrice: number }) => void;
  onUnauthorized: () => void;
}) {
  const [mode, setMode] = useState<"" | "search" | "aladin" | "manual">("");
  const [q, setQ] = useState("");
  const [aladin, setAladin] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState({ isbn: "", title: "", bookPrice: "" });
  const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");

  const results = useMemo(() => {
    if (!q.trim())
      return contracts.filter((c) => c.publisher && line.publisher && c.publisher.includes(line.publisher)).slice(0, 12);
    const nq = norm(q);
    return contracts.filter((c) => norm(c.title).includes(nq) || (c.isbn || "").includes(q.trim())).slice(0, 20);
  }, [q, contracts, line.publisher]);

  async function runAladin() {
    setBusy(true);
    setAladin(null);
    try {
      setAladin(await onLookup());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-2 text-[11px]">
        <button onClick={() => { setMode("aladin"); runAladin(); }} className="text-[var(--blue)] underline">알라딘 조회</button>
        <button onClick={() => setMode(mode === "search" ? "" : "search")} className="text-[var(--blue)] underline">직접 검색</button>
        <button onClick={() => setMode(mode === "manual" ? "" : "manual")} className="text-[var(--blue)] underline">직접 입력</button>
        <button onClick={onUnauthorized} className="text-[var(--purple)] underline">미허가</button>
      </div>

      {mode === "aladin" && (
        <div className="mt-1 border border-[var(--border-strong)] rounded-md p-2 max-w-[420px]">
          {busy && <div className="text-[11px] text-[var(--muted)]">알라딘 조회 중…</div>}
          {!busy && aladin && (
            <>
              {aladin.lookupError && <div className="text-[11px] text-[var(--red)]">조회 실패: {aladin.lookupError}</div>}
              {aladin.lookedUpTitle && (
                <div className="text-[11px] text-[var(--muted)] mb-1">조회 도서명: <b className="text-[var(--text)]">{aladin.lookedUpTitle}</b></div>
              )}
              {(aladin.candidates || []).length === 0 && (
                <div className="text-[11px] text-[var(--muted)]">계약목록에서 일치 후보 없음 — 직접 검색/입력 사용</div>
              )}
              {(aladin.candidates || []).map((c: any) => (
                <button key={c.contractIsbn} onClick={() => onPick(c.contractIsbn)}
                  className="block w-full text-left border border-[var(--border)] rounded px-2 py-1 mt-1 hover:border-[var(--orange)]">
                  <span className="text-[12px]">{c.title}</span>
                  <span className="mono text-[11px] text-[var(--muted)] ml-1">· {c.bookPrice.toLocaleString()}원 · 유사도 {(c.score * 100).toFixed(0)}%</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {mode === "search" && (
        <div className="mt-1 border border-[var(--border-strong)] rounded-md p-2 max-w-[420px]">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="계약 교재명 또는 ISBN 검색…"
            className="w-full border border-[var(--border)] rounded px-2 py-1 text-[12px] outline-none focus:border-[var(--orange)]" />
          <div className="max-h-40 overflow-auto mt-1 space-y-1">
            {results.length === 0 && <div className="text-[11px] text-[var(--muted)] px-1">검색 결과 없음</div>}
            {results.map((c) => (
              <button key={c.isbn} onClick={() => onPick(c.isbn)}
                className="block w-full text-left border border-[var(--border)] rounded px-2 py-1 hover:border-[var(--orange)]">
                <span className="text-[12px]">{c.title}</span>
                <span className="mono text-[11px] text-[var(--muted)] ml-1">· {c.isbn} · {(c.bookPrice || 0).toLocaleString()}원</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="mt-1 border border-[var(--border-strong)] rounded-md p-2 max-w-[420px] space-y-1">
          <div className="text-[11px] text-[var(--muted)]">계약목록에 없으면 직접 입력해 등록 (이후 자동 재사용)</div>
          <input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="계약 교재명"
            className="w-full border border-[var(--border)] rounded px-2 py-1 text-[12px]" />
          <div className="flex gap-1">
            <input value={m.isbn} onChange={(e) => setM({ ...m, isbn: e.target.value })} placeholder="계약 ISBN (모르면 비워두기)"
              className="flex-1 border border-[var(--border)] rounded px-2 py-1 text-[12px] mono" />
            <input value={m.bookPrice} onChange={(e) => setM({ ...m, bookPrice: e.target.value.replace(/[^0-9]/g, "") })} placeholder="단가"
              className="w-24 border border-[var(--border)] rounded px-2 py-1 text-[12px] mono text-right" />
          </div>
          <button
            disabled={!m.title.trim() || !m.bookPrice}
            onClick={() =>
              onManual({
                isbn: m.isbn.trim() || `M-${line.usedIsbn}`,
                title: m.title.trim(),
                publisher: line.publisher,
                bookPrice: Number(m.bookPrice || 0),
              })
            }
            className="rounded px-3 py-1 text-[12px] bg-[var(--ink)] text-white disabled:opacity-50">
            등록 후 매칭
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────── 공용 ───────────────── */
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`py-2 pr-3 font-medium ${className}`}>{children}</th>;
}
function Banner({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="mt-3 rounded-md px-3 py-2 text-[12px]"
      style={{ color, background: "color-mix(in srgb, " + color + " 8%, white)", border: `1px solid color-mix(in srgb, ${color} 25%, white)` }}>
      {children}
    </div>
  );
}
