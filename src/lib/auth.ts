// Edge(미들웨어)와 Node(API) 양쪽에서 동작하도록 Web Crypto(subtle) 사용.

const COOKIE_NAME = "settlement_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12시간

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret";
}

const enc = new TextEncoder();

async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 길이 노출 없는 상수시간 문자열 비교 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.SETTLEMENT_PASSWORD || "";
  if (!expected) return false;
  return safeEqual(input, expected);
}

/** 만료시각을 담은 서명 토큰 발급 */
export async function issueToken(): Promise<string> {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(exp);
  return `${payload}.${await hmacHex(payload)}`;
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmacHex(payload);
  if (!safeEqual(sig, expected)) return false;
  return Number(payload) > Date.now();
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
