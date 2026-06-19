import fs from "fs";
import os from "os";
import path from "path";
import { google } from "googleapis";
import { BigQuery } from "@google-cloud/bigquery";

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

export function getGoogleAuth(scopes: string[]) {
  ensureAdc();
  return new google.auth.GoogleAuth({ scopes });
}
