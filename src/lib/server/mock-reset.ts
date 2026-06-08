import { readFile } from "fs/promises";
import path from "path";
import { USE_MOCK_ORDERS } from "@/lib/app-config";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const RESET_TOKEN_FILE = path.join(DATA_DIR, "workspace", "reset-token");

export async function getMockResetToken(): Promise<string | null> {
  if (!USE_MOCK_ORDERS) return null;

  try {
    const token = (await readFile(RESET_TOKEN_FILE, "utf-8")).trim();
    return token || null;
  } catch {
    return null;
  }
}
