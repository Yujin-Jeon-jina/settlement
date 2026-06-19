"use client";

import {
  Users,
  Receipt,
  Building2,
  LayoutGrid,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Monitor,
  Share2,
  GraduationCap,
  SlidersHorizontal,
  ListMusic,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

type Item = { label: string; icon: LucideIcon; active?: boolean };
type Group = { title: string; items: Item[] };

// 기존 QandaCX Admin 사이드바 구조를 그대로 반영.
// 이 앱은 정산(Adjustment) 전용이므로 Adjustment만 활성/실동작.
const GROUPS: Group[] = [
  {
    title: "MANAGEMENT",
    items: [
      { label: "Members", icon: Users },
      { label: "Expense", icon: Receipt },
      { label: "Employment", icon: Building2 },
    ],
  },
  {
    title: "MASTER",
    items: [
      { label: "Dashboard", icon: LayoutGrid },
      { label: "Retention", icon: TrendingUp },
      { label: "Churn", icon: TrendingDown },
    ],
  },
  {
    title: "BIZOPS",
    items: [
      { label: "Dashboard", icon: LayoutGrid },
      { label: "Book", icon: BookOpen },
      { label: "Device", icon: Monitor },
      { label: "Matching", icon: Share2 },
      { label: "Tutor", icon: GraduationCap },
      { label: "Adjustment", icon: SlidersHorizontal, active: true },
      { label: "Lesson", icon: ListMusic },
      { label: "Chat", icon: MessageCircle },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="w-[176px] shrink-0 bg-white border-r border-[var(--border)] flex flex-col h-screen sticky top-0">
      {/* 로고 */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[var(--ink)] flex items-center justify-center text-white text-[13px] font-bold">
            Q
          </span>
          <span className="font-bold text-[15px] text-[var(--ink)]">QandaCX Admin</span>
        </div>
        <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#e7f8f0] text-[var(--teal)]">
          DEV
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-3">
            <div className="px-4 py-1 text-[10px] font-semibold tracking-wider text-[var(--muted)]">
              {g.title}
            </div>
            {g.items.map((it, i) => {
              const Icon = it.icon;
              return (
                <a
                  key={g.title + it.label + i}
                  href={it.active ? "/settlement" : undefined}
                  className={[
                    "flex items-center gap-2.5 pl-4 pr-3 py-2 text-[13px] cursor-pointer",
                    it.active
                      ? "text-[var(--orange)] font-semibold border-r-2 border-[var(--orange)] bg-[#fff7f0]"
                      : "text-[#6b7280] hover:bg-[#fafafa]",
                  ].join(" ")}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  {it.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
