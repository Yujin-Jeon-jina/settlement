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
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={submit}
        className="bg-white border border-[var(--border)] rounded-lg shadow-sm p-8 w-[360px]"
      >
        <h1 className="text-lg font-semibold mb-1">출판사 정산</h1>
        <p className="text-[var(--muted)] mb-6 text-[13px]">접근하려면 비밀번호를 입력하세요.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full border border-[var(--border)] rounded-md px-3 py-2 mb-3 outline-none focus:border-[var(--primary)]"
        />
        {error && <p className="text-red-500 text-[13px] mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--primary)] text-white rounded-md py-2 font-medium disabled:opacity-60"
        >
          {loading ? "확인 중…" : "입장"}
        </button>
      </form>
    </div>
  );
}
