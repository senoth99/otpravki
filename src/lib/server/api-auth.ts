import { NextResponse } from "next/server";

const API_SECRET = process.env.OTPRAVKI_API_SECRET?.trim();

export function isApiAuthEnabled(): boolean {
  return Boolean(API_SECRET);
}

export function getApiSecretFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-otpravki-secret")?.trim() ?? null;
}

export function isAuthorizedRequest(request: Request): boolean {
  if (!API_SECRET) return true;
  return getApiSecretFromRequest(request) === API_SECRET;
}

export function requireMutatingAuth(request: Request): NextResponse | null {
  if (isAuthorizedRequest(request)) return null;
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function isAuthorizedSocketSecret(secret: unknown): boolean {
  if (!API_SECRET) return true;
  return typeof secret === "string" && secret === API_SECRET;
}
