const API_SECRET = process.env.NEXT_PUBLIC_OTPRAVKI_API_SECRET?.trim();

export function mutatingApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_SECRET) {
    headers["X-Otpravki-Secret"] = API_SECRET;
  }
  return headers;
}
