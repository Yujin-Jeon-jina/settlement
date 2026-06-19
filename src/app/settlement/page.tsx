"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublisherSummary, SettlementLineDraft } from "@/lib/types";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

function defaultMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based, 이번 달의 이전 달을 기본으로
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  auto: { label: "자동매칭", cls: "bg-green-100 text-green-700" },
  confirmed: { label: "확정", cls: "bg-blue-100 text-blue-700" },
  unmatched: { label: "확인필요", cls: "bg-amber-100 text-amber-700" },
  unauthorized: { label: "미허가", cls: "bg-gray-200 text-gray-600" },
};

export default function SettlementPage() {
  const router = useRouter();
  const def = useMemo(defaultMonthRange, []);
  const [startDate, setStartDate] = useState(def.start);
  const [endDate, setEndDate] = useState(def.end);
  const [lines, setLines] = useState<SettlementLineDraft[]>([]);
  const [summary, setSummary] = useState<PublisherSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePublisher, setActivePublisher] = useState<string>("전체");
  const [savedMsg, setSavedMsg] = useState("");

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

  async function save() {
    const res = await fetch("/api/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, lines }),
    });
    if (res.ok) setSavedMsg("정산 이력이 저장되었습니다.");
    else setSavedMsg("저장 실패 (DB 연결 확인 필요)");
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

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside className="w-56 bg-[#001529] text-gray-300 flex flex-col">
        <div className="h-14 flex items-center px-5 text-white font-semibold border-b border-white/10">
          QandaCX Admin
        </div>
        <nav className="flex-1 py-3 text-[13px]">
          <div className="px-5 py-2 text-gray-500 text-xs">정산</div>
          <a className="block px-5 py-2 bg-[var(--primary)] text-white">출판사 정산</a>
        </nav>
        <button onClick={logout} className="text-left px-5 py-3 text-gray-400 hover:text-white border-t border-white/10">
          로그아웃
        </button>
      </aside>

      {/* 본문 */}
      <main className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b border-[var(--border)] flex items-center px-6 justify-between">
          <h1 className="font-semibold">출판사 정산</h1>
          {lines.length > 0 && (
            <div className="text-[13px] text-[var(--muted)]">
              전체 합계 <span className="text-[var(--text)] font-semibold">{won(grandTotal)}</span>
              {needAttention > 0 && (
                <span className="ml-3 text-amber-600">확인필요 {needAttention}건</span>
              )}
            </div>
          )}
        </header>

        <div className="p-6 space-y-5">
          {/* 정산월 선택 */}
          <section className="bg-white border border-[var(--border)] rounded-lg p-4 flex items-end gap-3">
            <label className="text-[13px]">
              <span className="block text-[var(--muted)] mb-1">시작일</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border border-[var(--border)] rounded-md px-3 py-2" />
            </label>
            <label className="text-[13px]">
              <span className="block text-[var(--muted)] mb-1">종료일</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="border border-[var(--border)] rounded-md px-3 py-2" />
            </label>
            <button onClick={load} disabled={loading}
              className="bg-[var(--primary)] text-white rounded-md px-4 py-2 font-medium disabled:opacity-60">
              {loading ? "집계 중…" : "사용량 불러오기"}
            </button>
            {lines.length > 0 && (
              <div className="ml-auto flex gap-2">
                <button onClick={exportCsv} className="border border-[var(--border)] rounded-md px-4 py-2">CSV 내보내기</button>
                <button onClick={save} className="border border-[var(--border)] rounded-md px-4 py-2">정산 이력 저장</button>
              </div>
            )}
          </section>

          {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-md p-3 text-[13px]">{error}</div>}
          {savedMsg && <div className="bg-blue-50 text-blue-700 border border-blue-200 rounded-md p-3 text-[13px]">{savedMsg}</div>}

          {/* 출판사별 요약 카드 */}
          {summary.length > 0 && (
            <section className="grid grid-cols-4 gap-3">
              {summary.map((s) => (
                <div key={s.publisher} className="bg-white border border-[var(--border)] rounded-lg p-4">
                  <div className="text-[var(--muted)] text-[13px]">{s.publisher}</div>
                  <div className="text-xl font-semibold mt-1">{won(s.totalAmount)}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {s.lineCount}개 교재
                    {s.unauthorizedAmount > 0 && <span className="ml-2 text-gray-400">미허가 {won(s.unauthorizedAmount)}</span>}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* 라인 테이블 */}
          {lines.length > 0 && (
            <section className="bg-white border border-[var(--border)] rounded-lg overflow-hidden">
              <div className="flex gap-1 border-b border-[var(--border)] px-3 pt-3">
                {publishers.map((p) => (
                  <button key={p} onClick={() => setActivePublisher(p)}
                    className={`px-3 py-2 text-[13px] rounded-t-md ${activePublisher === p ? "bg-[var(--bg)] font-medium" : "text-[var(--muted)]"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                    <th className="px-4 py-2 font-medium">출판사</th>
                    <th className="px-4 py-2 font-medium">교재 (사용 ISBN)</th>
                    <th className="px-4 py-2 font-medium text-right">사용자수</th>
                    <th className="px-4 py-2 font-medium text-right">단가</th>
                    <th className="px-4 py-2 font-medium text-right">금액</th>
                    <th className="px-4 py-2 font-medium">매칭</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((l) => {
                    const meta = STATUS_META[l.matchStatus];
                    return (
                      <tr key={l.usedIsbn} className="border-b border-[var(--border)] last:border-0 align-top">
                        <td className="px-4 py-3">{l.publisher}</td>
                        <td className="px-4 py-3">
                          <div>{l.bookName}</div>
                          <div className="text-xs text-[var(--muted)]">{l.usedIsbn}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{l.userCount}</td>
                        <td className="px-4 py-3 text-right">{l.unitPrice ? won(l.unitPrice) : "-"}</td>
                        <td className="px-4 py-3 text-right font-medium">{l.amount ? won(l.amount) : "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${meta.cls}`}>{meta.label}</span>
                          {l.matchStatus === "unmatched" && (
                            <div className="mt-2 space-y-1">
                              {l.candidates.length === 0 && (
                                <div className="text-xs text-[var(--muted)]">추천 후보 없음</div>
                              )}
                              {l.candidates.map((c) => (
                                <button key={c.contractIsbn} onClick={() => confirmMatch(l, c.contractIsbn)}
                                  className="block w-full text-left border border-[var(--border)] rounded px-2 py-1 hover:border-[var(--primary)]">
                                  <span className="text-xs">{c.title}</span>
                                  <span className="text-xs text-[var(--muted)] ml-1">
                                    · {won(c.bookPrice)} · 유사도 {(c.score * 100).toFixed(0)}%
                                  </span>
                                </button>
                              ))}
                              <button onClick={() => markUnauthorized(l)}
                                className="text-xs text-gray-500 underline">미허가 처리</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {!loading && lines.length === 0 && !error && (
            <div className="text-center text-[var(--muted)] py-20 text-[13px]">
              정산월을 선택하고 “사용량 불러오기”를 누르세요.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
