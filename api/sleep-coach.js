import fs from "node:fs/promises";
import { getKey } from "../getKey.mjs";

const root = process.cwd();

async function instructions() {
  const brief = await fs.readFile(`${root}/BRIEF.md`, "utf8");
  const marker = "## My AI’s instructions";
  const section = brief.includes(marker) ? brief.split(marker, 2)[1].split("\n## ", 1)[0] : brief;
  return `${marker}${section}\n\nSafety additions for this prototype:\n- Give gentle, practical sleep guidance for stress and habits.\n- Do not diagnose, prescribe medication, or make promises.\n- If someone mentions danger, self-harm, severe symptoms, or a medical emergency, tell them to contact a trusted adult or qualified healthcare professional right away.\n- Keep the response easy for an elementary student to understand.\n- Make one short plan with a calming step and a next step for tomorrow.\n- Use fresh, concern-specific wording and do not repeatedly use the phrase wind down.\n- Do not begin every answer with the same sentence or use the same step names every time.\n- Avoid contractions and possessive forms ending in 's or ’s.\n- Return plain text only. Do not use Markdown, asterisks, bold text, headings, or code blocks.\n- Mention that this is educational support, not medical care.`;
}

function model() {
  return "gpt-5.6-luna";
}

function errorPayload(message, fix) {
  return { error: { message, fix } };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json(errorPayload("This action only accepts a sleep report.", "Send a POST request from the app."));
  const { concern = "", extra = "" } = request.body || {};
  if (typeof concern !== "string" || typeof extra !== "string" || !concern.trim() || concern.length > 500 || extra.length > 800) {
    return response.status(400).json(errorPayload("Please choose a sleep concern first.", "Choose a concern and keep the report short."));
  }
  const input = `The person chose this sleep concern: ${concern.trim()}${extra.trim() ? `\nTheir sleep report: ${extra.trim()}` : ""}\nUse the sleep report as the main context. Give the one-time guided plan now, using fresh wording that fits this concern.`;
  try {
    let key = await getKey();
    const body = async () => JSON.stringify({ model: model(), reasoning: { effort: "none" }, instructions: await instructions(), input, tools: [{ type: "web_search" }], text: { verbosity: "low" }, max_output_tokens: 320, stream: true });
    let openai = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: await body() });
    if (openai.status === 401) {
      key = await getKey(true);
      openai = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: await body() });
    }
    if (!openai.ok || !openai.body) return response.status(openai.status === 401 ? 502 : 503).json(errorPayload(openai.status === 401 ? "OpenAI rejected the AI key." : "The sleep guide could not answer right now.", "Check the MindDo key settings and try again."));
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    for await (const chunk of openai.body) response.write(chunk);
    return response.end();
  } catch (error) {
    console.error(error.fix || "Check the MindDo service and internet connection, then try again.");
    return response.status(502).json(errorPayload(error.message || "The sleep guide could not answer right now.", error.fix || "Check the MindDo service and internet connection, then try again."));
  }
}
