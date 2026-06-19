"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { PublisherSummary, SettlementLineDraft } from "@/lib/types";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

function defaultMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  auto: { label: "자동매칭", color: "var(--teal)" },
  confirmed: { label: "확정", color: "var(--blue)" },
  unmatched: { label: "확인필요", color: "var(--orange)" },
  unauthorized: { label: "미허가", color: "var(--purple)" },
};

type Tab = "settlement" | "mapping" | "history";

export default function SettlementPage() {
  const router = useRouter();
  const def = useMemo(defaultMonthRange, []);
  const [tab, setTab] = useState<Tab>("settlement");
  const [startDate, setStartDate] = useState(def.start);
  const [endDate, setEndDate] = useState(def.end);
  const [lines, setLines] = useState<SettlementLineDraft[]>([]);
  const [summary, setSummary] = useState<PublisherSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePublisher, setActivePublisher] = useState("전체");
  const [savedMsg, setSavedMsg] = useState("");
  const [verify, setVerify] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

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
    setSummary(j.summary);
    setActivePublisher("전체");
  }

  function updateLine(usedIsbn: string, patch: Partial<SettlementLineDraft>) {
    setLines((prev) => prev.map((l) => (l.usedIsbn === usedIsbn ? { ...l, ...patch } : l)));
  }

  async function confirmMatch(line: SettlementLineDraft, contractIsbn: string) {
    const cand = line.candidates.find((c) => c.contractIsbn === contractIsbn);
    const unitPrice = cand?.bookPrice ?? 0;
    updateLine(line.usedIsbn, {
      matchStatus: "confirmed",
      contractIsbn,
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

  const publishers = ["전체", ...summary.map((s) => s.publisher)];
  const visibleLines =
    activePublisher === "전체" ? lines : lines.filter((l) => l.publisher === activePublisher);
  const grandTotal = summary.reduce((a, s) => a + s.totalAmount, 0);
  const needAttention = lines.filter((l) => l.matchStatus === "unmatched").length;

  const TABS: { id: Tab; label: string }[] = [
    { id: "settlement", label: "정산" },
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
              needAttention,
              exportCsv,
              save,
              confirmMatch,
              markUnauthorized,
              runVerify,
              verifying,
              verify,
            }}
          />
        )}
        {tab === "mapping" && <MappingTab />}
        {tab === "history" && <HistoryTab />}
      </main>
    </div>
  );
}

/* ───────────────── 정산 탭 ───────────────── */
function SettlementTab(p: any) {
  return (
    <>
      {/* 요약 한 줄 */}
      <div className="mt-4 text-[12px] text-[var(--muted)]">
        {p.lines.length > 0 ? (
          <>
            전체 합계 <b className="text-[var(--ink)]">{won(p.grandTotal)}</b>
            {" · "}교재 {p.lines.length}건
            {p.needAttention > 0 && (
              <span className="text-[var(--orange)]"> · 확인필요 {p.needAttention}건</span>
            )}
          </>
        ) : (
          "정산월을 선택하고 사용량을 불러오세요."
        )}
      </div>

      {/* 정산월 + 액션 */}
      <div className="flex items-center gap-2 mt-3">
        <input type="date" value={p.startDate} onChange={(e: any) => p.setStartDate(e.target.value)}
          className="border border-[var(--border-strong)] rounded-md px-2.5 py-1.5 text-[13px]" />
        <span className="text-[var(--muted)]">~</span>
        <input type="date" value={p.endDate} onChange={(e: any) => p.setEndDate(e.target.value)}
          className="border border-[var(--border-strong)] rounded-md px-2.5 py-1.5 text-[13px]" />
        <button onClick={p.load} disabled={p.loading}
          className="rounded-md px-3.5 py-1.5 text-[13px] font-medium bg-[var(--ink)] text-white disabled:opacity-60">
          {p.loading ? "집계 중…" : "사용량 불러오기"}
        </button>
        {p.lines.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={p.runVerify} disabled={p.verifying}
              className="rounded-md px-3 py-1.5 text-[13px] border border-[var(--border-strong)] text-[var(--text)] disabled:opacity-60">
              {p.verifying ? "대조 중…" : "피벗 대조"}
            </button>
            <button onClick={p.save}
              className="rounded-md px-3 py-1.5 text-[13px] border border-[var(--border-strong)] text-[var(--text)]">
              이력 저장
            </button>
            <button onClick={p.exportCsv} className="text-[13px] text-[var(--blue)] font-medium">⬇ CSV</button>
          </div>
        )}
      </div>

      {/* 피벗 대조 결과 */}
      {p.verify && !p.verify.error && (
        <div className="mt-3 rounded-md border border-[var(--border-strong)] p-3">
          <div className="text-[13px]">
            피벗 대조:{" "}
            <b style={{ color: p.verify.summary.mismatched === 0 ? "var(--teal)" : "var(--orange)" }}>
              {p.verify.summary.matched}/{p.verify.summary.total} 일치
            </b>
            {p.verify.summary.mismatched > 0 && (
              <span className="text-[var(--orange)]"> · 불일치 {p.verify.summary.mismatched}건</span>
            )}
            <span className="text-[var(--muted)]">
              {" "}· BQ 사용자합 {p.verify.summary.bqTotalUsers} / 피벗 {p.verify.summary.pivotTotalUsers}
            </span>
          </div>
          {p.verify.summary.mismatched > 0 && (
            <table className="w-full text-[12px] mt-2">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-1 pr-3 font-medium">출판사</th>
                  <th className="py-1 pr-3 font-medium">교재 / ISBN</th>
                  <th className="py-1 pr-3 font-medium text-right">BQ</th>
                  <th className="py-1 pr-3 font-medium text-right">피벗</th>
                </tr>
              </thead>
              <tbody>
                {p.verify.rows.filter((r: any) => !r.match).map((r: any) => (
                  <tr key={r.usedIsbn} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-3">{r.publisher}</td>
                    <td className="py-1.5 pr-3">
                      {r.bookName} <span className="mono text-[11px] text-[var(--muted)]">{r.usedIsbn}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right mono">{r.bqCount ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right mono">{r.pivotCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {p.verify?.error && <Banner color="var(--red)">{p.verify.error}</Banner>}

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
              {p.visibleLines.map((l: SettlementLineDraft) => {
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
                          <button onClick={() => p.markUnauthorized(l)}
                            className="text-[11px] text-[var(--purple)] underline">미허가 처리</button>
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
          <div className="text-[12px] text-[var(--muted)] mt-4">총 {p.visibleLines.length}건</div>
        </div>
      )}
    </>
  );
}

/* ───────────────── 교재매핑 탭 ───────────────── */
function MappingTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/mappings").then((r) => r.json()).then((j) => {
      setRows(j.mappings || []);
      setLoaded(true);
    });
  }, []);
  async function remove(usedIsbn: string) {
    await fetch(`/api/mappings?usedIsbn=${encodeURIComponent(usedIsbn)}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.usedIsbn !== usedIsbn));
  }
  return (
    <div className="mt-5">
      <div className="text-[12px] text-[var(--muted)] mb-3">
        확정한 사용 ISBN ↔ 계약 교재 매핑. 저장된 매핑은 다음 달 정산에 자동 적용됩니다.
      </div>
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
  useEffect(() => {
    fetch("/api/settlement").then((r) => r.json()).then((j) => {
      setRuns(j.runs || []);
      setLoaded(true);
    });
  }, []);
  return (
    <div className="mt-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[var(--muted)] text-[12px] border-b border-[var(--border-strong)]">
            <Th>정산기간</Th><Th>상태</Th><Th className="text-right">라인수</Th><Th>생성일시</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-[var(--border)]">
              <td className="py-3 pr-3 mono text-[12px]">
                {String(r.periodStart).slice(0, 10)} ~ {String(r.periodEnd).slice(0, 10)}
              </td>
              <td className="py-3 pr-3 text-[12px]" style={{ color: "var(--teal)" }}>{r.status}</td>
              <td className="py-3 pr-3 text-right mono">{r._count?.lines ?? "-"}</td>
              <td className="py-3 pr-3 mono text-[12px]">{String(r.createdAt).slice(0, 19).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {loaded && runs.length === 0 && (
        <div className="text-center text-[var(--muted)] py-16 text-[13px]">저장된 정산 이력이 없습니다.</div>
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
