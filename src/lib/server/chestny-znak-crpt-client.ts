import { toGtin14 } from "@/lib/chestny-znak-gtin";
import { getCrptSessionToken, signCrptDetached } from "@/lib/server/chestny-znak-api";

export interface KmRecord {
  sgtin: string;
  cis: string;
  gtin?: string;
  status?: string;
  productGroup?: string;
  emissionDate?: string;
  introducedDate?: string;
  ownerInn?: string;
  generalPackageType?: string;
}

export interface KmSearchCursor {
  lastEmissionDate: string;
  sgtin: string;
}

export interface KmSearchResult {
  items: KmRecord[];
  isLastPage: boolean;
  totalFetched: number;
  nextCursor: KmSearchCursor | null;
}

function apiV3Base(): string {
  return (
    process.env.CRPT_API_URL?.trim().replace(/\/$/, "") ??
    "https://markirovka.crpt.ru/api/v3/true-api"
  );
}

function apiV4Base(): string {
  return (
    process.env.CRPT_API_URL_V4?.trim().replace(/\/$/, "") ??
    apiV3Base().replace("/api/v3/true-api", "/api/v4/true-api")
  );
}

function productGroup(): string {
  return (process.env.CRPT_PRODUCT_GROUP?.trim() || "lp").toLowerCase();
}

function participantInn(): string {
  const fromEnv = process.env.CRPT_INN?.trim();
  if (fromEnv) return fromEnv;
  throw new Error("Не задан CRPT_INN в .env (ИНН участника оборота)");
}

async function bearerToken(): Promise<string> {
  const session = await getCrptSessionToken();
  return session.token;
}

async function crptFetch<T>(
  base: string,
  path: string,
  token: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json;charset=UTF-8";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${base}${path}`, { ...init, headers, body });
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (!res.ok) {
    const err =
      typeof parsed === "object" &&
      parsed !== null &&
      ("error_message" in parsed
        ? String((parsed as { error_message?: string }).error_message)
        : "message" in parsed
          ? String((parsed as { message?: string }).message)
          : text.slice(0, 300));
    throw new Error(`CRPT ${res.status}: ${err || res.statusText}`);
  }
  return parsed as T;
}

function mapKmRow(row: Record<string, unknown>): KmRecord {
  return {
    sgtin: String(row.sgtin ?? row.cis ?? ""),
    cis: String(row.cis ?? row.sgtin ?? ""),
    gtin: row.gtin ? String(row.gtin) : undefined,
    status: row.status ? String(row.status) : undefined,
    productGroup: row.productGroup ? String(row.productGroup) : undefined,
    emissionDate: row.emissionDate ? String(row.emissionDate) : undefined,
    introducedDate: row.introducedDate ? String(row.introducedDate) : undefined,
    ownerInn: row.ownerInn ? String(row.ownerInn) : undefined,
    generalPackageType: row.generalPackageType
      ? String(row.generalPackageType)
      : undefined,
  };
}

export async function searchActiveKm(options?: {
  perPage?: number;
  maxPages?: number;
  cursor?: KmSearchCursor | null;
  gtin?: string;
}): Promise<KmSearchResult> {
  const perPage = options?.perPage ?? 100;
  const maxPages = options?.maxPages ?? 1;
  const pg = productGroup();
  const now = new Date();
  const from =
    process.env.CRPT_SEARCH_EMISSION_FROM?.trim() || "2020-01-01T00:00:00.000Z";
  const to = now.toISOString();
  const token = await bearerToken();
  const gtin14 = toGtin14(options?.gtin ?? "");

  const items: KmRecord[] = [];
  let isLastPage = false;
  let pagination: Record<string, string | number> = options?.cursor
    ? {
        perPage,
        lastEmissionDate: options.cursor.lastEmissionDate,
        sgtin: options.cursor.sgtin,
      }
    : { perPage };
  let page = 0;
  let nextCursor: KmSearchCursor | null = null;

  while (page < maxPages && !isLastPage) {
    const filter: Record<string, unknown> = {
      productGroups: [pg],
      states: [{ status: "INTRODUCED" }],
      emissionDatePeriod: { from, to },
    };
    if (gtin14) {
      filter.gtins = [gtin14];
    }

    const data = await crptFetch<{
      isLastPage?: boolean;
      result?: Record<string, unknown>[];
    }>(apiV4Base(), "/cises/search", token, {
      method: "POST",
      json: {
        filter,
        pagination,
      },
    });

    const batch = (data.result ?? []).map(mapKmRow);
    items.push(...batch);
    isLastPage = Boolean(data.isLastPage) || batch.length === 0;

    if (!isLastPage && batch.length >= perPage) {
      const last = batch[batch.length - 1];
      nextCursor = {
        lastEmissionDate: last.emissionDate ?? to,
        sgtin: last.sgtin,
      };
      pagination = { perPage, ...nextCursor };
    } else {
      nextCursor = null;
    }

    if (isLastPage || batch.length < perPage) break;
    page += 1;
  }

  return { items, isLastPage, totalFetched: items.length, nextCursor };
}

export interface WriteOffResult {
  docId: string;
  cisList: string[];
}

function extractDocId(response: unknown): string {
  if (typeof response === "string") {
    return response.replace(/^"+|"+$/g, "").trim();
  }
  if (typeof response === "number" && Number.isFinite(response)) {
    return String(response);
  }
  if (Array.isArray(response) && response.length > 0) {
    return extractDocId(response[0]);
  }
  if (response && typeof response === "object") {
    const row = response as Record<string, unknown>;
    for (const key of [
      "documentId",
      "document_id",
      "docId",
      "doc_id",
      "id",
      "uuid",
      "number",
      "value",
      "raw",
    ]) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) {
        return value.replace(/^"+|"+$/g, "").trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    if (row.data !== undefined) return extractDocId(row.data);
    if (row.result !== undefined) return extractDocId(row.result);
  }
  return "";
}

export async function writeOffKm(
  cisList: string[],
  options?: { reason?: string; docNum?: string; address?: string },
): Promise<WriteOffResult> {
  if (cisList.length === 0) {
    throw new Error("Не выбраны коды маркировки");
  }

  const inn = participantInn();
  const today = new Date().toISOString().slice(0, 10);
  const innerDoc = {
    participantId: inn,
    dropoutReason:
      options?.reason?.trim() ||
      process.env.CRPT_WRITE_OFF_REASON?.trim() ||
      "OTHER",
    withChild: false,
    sntins: cisList,
    sourceDocType: "OTHER",
    sourceDocDate: today,
    sourceDocNum: options?.docNum?.trim() || `CZ-${Date.now()}`,
    sourceDocName: "Списание товаров",
    ...(options?.address || process.env.CRPT_WRITE_OFF_ADDRESS?.trim()
      ? { address: options?.address || process.env.CRPT_WRITE_OFF_ADDRESS?.trim() }
      : {}),
  };

  const productDocument = Buffer.from(JSON.stringify(innerDoc), "utf-8").toString(
    "base64",
  );
  const signature = await signCrptDetached(productDocument);

  const pg = productGroup();
  const token = await bearerToken();
  const response = await crptFetch<unknown>(
    apiV3Base(),
    `/lk/documents/create?pg=${encodeURIComponent(pg)}`,
    token,
    {
      method: "POST",
      json: {
        document_format: "MANUAL",
        product_document: productDocument,
        type: "WRITE_OFF",
        signature,
      },
    },
  );

  const docId = extractDocId(response) || `accepted-${Date.now()}`;
  return { docId, cisList };
}
