import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let cached = null;

export class KeygenError extends Error {
  constructor(message, fix) {
    super(message);
    this.name = "KeygenError";
    this.fix = fix;
  }
}

async function readEnv() {
  const values = {};
  let text;
  try { text = await fs.readFile(path.join(ROOT, ".env"), "utf8"); }
  catch { throw new KeygenError("The AI key service is not set up yet.", "Add KEYGEN_URL and KEYGEN_TOKEN to the local .env file."); }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^("|')(.*)\1$/, "$2");
  }
  return values;
}

function stillValid(entry) { return entry && Date.now() < entry.expiresAt; }

export async function getKey() {
  if (stillValid(cached)) return cached.apiKey;
  const env = await readEnv();
  const keygenUrl = env.KEYGEN_URL;
  const token = env.KEYGEN_TOKEN;
  if (!keygenUrl || keygenUrl === "paste-here" || !token || token === "paste-here") {
    throw new KeygenError("The AI key service is not set up yet.", "Replace both paste-here values in .env with the MindDo values.");
  }
  let response;
  try {
    response = await fetch(`${keygenUrl.replace(/\/$/, "")}/api/lookup-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new KeygenError("The AI key service could not be reached.", "Check the MindDo URL and internet connection, then try again.");
  }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok || !data.apiKey || !data.expiresAt) {
    throw new KeygenError(data?.error?.message || "The AI key service could not provide a key.", data?.error?.fix || "Check the MindDo token and key service settings.");
  }
  const expiresAt = new Date(data.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new KeygenError("The AI key service returned an expired key.", "Ask MindDo for a fresh key and check the expiresAt value.");
  }
  cached = { apiKey: data.apiKey, expiresAt };
  return cached.apiKey;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--force")) cached = null;
  getKey().then((apiKey) => process.stdout.write(JSON.stringify({ apiKey }))).catch((error) => {
    process.stderr.write(JSON.stringify({ message: error.message, fix: error.fix }));
    process.exitCode = 1;
  });
}
