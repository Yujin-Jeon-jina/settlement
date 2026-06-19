"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/settlement");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "로그인 실패");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
      <form
        onSubmit={submit}
        className="bg-white border border-[var(--border-strong)] rounded-xl shadow-sm p-8 w-[360px]"
      >
        <div className="flex items-center gap-2 mb-5">
          <span className="w-7 h-7 rounded-full bg-[var(--ink)] flex items-center justify-center text-white text-[13px] font-bold">
            Q
          </span>
          <span className="font-bold text-[15px] text-[var(--ink)]">QandaCX Admin</span>
        </div>
        <h1 className="text-[16px] font-bold text-[var(--ink)] mb-1">출판사 정산</h1>
        <p className="text-[var(--muted)] mb-5 text-[13px]">접근하려면 비밀번호를 입력하세요.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full border border-[var(--border-strong)] rounded-md px-3 py-2 mb-3 outline-none focus:border-[var(--orange)]"
        />
        {error && <p className="text-[var(--red)] text-[13px] mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--orange)] text-white rounded-md py-2 font-semibold disabled:opacity-60"
        >
          {loading ? "확인 중…" : "입장"}
        </button>
      </form>
    </div>
  );
}
