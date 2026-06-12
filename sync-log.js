const path = require("path");
const fsp = require("fs/promises");

function logFilePath() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, "sync", "events.jsonl");
}

async function logSync(type, data = {}) {
  try {
    const entry = { at: new Date().toISOString(), type, ...data };
    const file = logFilePath();
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // logging must not break sync
  }
}

async function readSyncLog(lines = 100) {
  try {
    const raw = await fsp.readFile(logFilePath(), "utf8");
    const parsed = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        parsed.push(JSON.parse(trimmed));
      } catch {
        // skip corrupt line
      }
    }
    return parsed.slice(-lines);
  } catch {
    return [];
  }
}

module.exports = { logSync, readSyncLog, logFilePath };
