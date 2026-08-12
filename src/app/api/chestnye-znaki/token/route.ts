import { NextResponse } from "next/server";
import { getCrptSessionToken } from "@/lib/server/chestny-znak-api";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function POST() {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const result = await getCrptSessionToken();
    return NextResponse.json({
      ok: true,
      token: result.token,
      uuid: result.uuid,
      certSubject: result.certSubject,
      certThumbprint: result.certThumbprint,
      apiUrl: result.apiUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка получения токена",
      },
      { status: 502 },
    );
  }
}
