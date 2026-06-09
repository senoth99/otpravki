const path = require("path");
const fsp = require("fs/promises");

function logFilePath() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, "sync", "events.jsonl");
}

async function logSync(type, data = {}) {
  const entry = { at: new Date().toISOString(), type, ...data };
  const file = logFilePath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readSyncLog(lines = 100) {
  try {
    const raw = await fsp.readFile(logFilePath(), "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-lines)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

module.exports = { logSync, readSyncLog, logFilePath };
