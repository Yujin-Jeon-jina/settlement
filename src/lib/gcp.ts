import fs from "fs";
import os from "os";
import path from "path";
import dns from "dns";
import { google } from "googleapis";
import { BigQuery } from "@google-cloud/bigquery";

// 일부 컨테이너 환경(Railway 등)에서 IPv6 경로가 불안정해 googleapis 토큰 요청이
// "Premature close"로 끊기는 문제 방지 → IPv4 우선 + 연결 계층 IPv4 강제.
try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  /* noop */
}
try {
  // Node 전역 fetch(undici)가 IPv4로만 연결하도록 강제 (Premature close 방지)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { setGlobalDispatcher, Agent } = require("undici");
  setGlobalDispatcher(
    new Agent({
      connect: { family: 4, timeout: 30_000 },
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 30_000,
    })
  );
} catch {
  /* undici 미가용 시 무시 */
}

/**
 * Google 자격증명 통합 처리.
 * 서비스계정(JSON) 또는 본인 계정 OAuth(authorized_user JSON, gcloud ADC) 모두 지원.
 *
 * 우선순위:
 *  1) GOOGLE_APPLICATION_CREDENTIALS (파일 경로) — 로컬에서 gcloud 로그인 시 자동
 *  2) GOOGLE_SERVICE_ACCOUNT_JSON (서비스계정 JSON 문자열)
 *  3) GOOGLE_OAUTH_CREDENTIALS (authorized_user JSON 문자열; gcloud ADC 파일 내용)
 *
 * 2/3은 임시파일로 써서 ADC(GOOGLE_APPLICATION_CREDENTIALS)로 노출 → BigQuery/googleapis가
 * 서비스계정·사용자계정 타입을 모두 자동 인식한다.
 */
let adcReady = false;

function ensureAdc(): boolean {
  if (adcReady) return !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  adcReady = true;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_OAUTH_CREDENTIALS;
  if (!raw) return false;

  const file = path.join(os.tmpdir(), "settlement-gcp-creds.json");
  fs.writeFileSync(file, raw, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  return true;
}

export function hasGoogleCreds(): boolean {
  return ensureAdc();
}

/** 목업 모드 여부 (자격증명 없거나 강제 목업) */
export function useMock(): boolean {
  return process.env.USE_MOCK_DATA === "true" || !hasGoogleCreds();
}

export function getBigQuery(): BigQuery {
  ensureAdc();
  return new BigQuery({ projectId: process.env.BIGQUERY_PROJECT_ID });
}

const RETRYABLE = /premature close|ECONNRESET|socket hang up|fetch failed|ETIMEDOUT|EAI_AGAIN|network|terminated/i;

/** 일시적 네트워크 오류(특히 oauth 토큰 'Premature close') 시 재시도 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      if (!RETRYABLE.test(msg) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getGoogleAuth(scopes: string[]) {
  ensureAdc();
  return new google.auth.GoogleAuth({ scopes });
}
