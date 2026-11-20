import { loadSessions, saveSession } from "/storage.js";

const form = document.querySelector("#coach-form");
const button = document.querySelector("#coach-button");
const thinking = document.querySelector("#thinking");
const result = document.querySelector("#result");
const answer = document.querySelector("#answer");
const errorMessage = document.querySelector("#error");
const sessionList = document.querySelector("#session-list");

function renderSessions(sessions = loadSessions()) {
  sessionList.replaceChildren();
  sessions.slice(0, 4).forEach((session) => {
    const item = document.createElement("article");
    item.className = "session-item";
    item.innerHTML = `<span class="session-dot"></span><div><strong>${session.label}</strong><p>${session.text}</p></div><time>${session.createdAt}</time>`;
    sessionList.append(item);
  });
}

function setLoading(isLoading) {
  button.disabled = isLoading;
  button.setAttribute("aria-busy", String(isLoading));
  thinking.hidden = !isLoading;
  if (isLoading) {
    result.hidden = true;
    errorMessage.hidden = true;
    answer.textContent = "";
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function showResult(text) {
  answer.textContent = text;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const concern = formData.get("concern");
  const extra = formData.get("extra") || "";
  if (!concern) return;
  setLoading(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("/api/sleep-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concern, extra }),
      signal: controller.signal
    });
    if (!response.ok) {
      const data = await response.json();
        throw new Error(data.error === "missing-key" ? "I cannot reach the sleep guide yet. Please add an OpenAI key to .env, then restart the app." : data.error === "invalid-key" ? "The OpenAI key was rejected. Replace the key in .env, then restart the app." : "I could not reach the sleep guide. Please check the key and your internet connection, then try again.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullAnswer = "";
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const eventText of events) {
        const dataLine = eventText.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const event = JSON.parse(dataLine.slice(5).trim());
        if (event.type === "delta") {
          fullAnswer += event.text;
          thinking.hidden = true;
          showResult(fullAnswer);
        }
        if (event.type === "error") {
          const message = typeof event.error === "object" ? event.error.message : event.error;
          throw new Error(message === "missing-key" ? "I cannot reach the sleep guide yet. Please add the MindDo values to .env, then restart the app." : message === "invalid-key" ? "The AI key was rejected. Replace the MindDo values in .env, then restart the app." : message || "I could not reach the sleep guide. Please check the key and your internet connection, then try again.");
        }
        if (event.type === "done") finished = true;
      }
    }
    if (!fullAnswer) throw new Error("I could not reach the sleep guide. Please check the key and your internet connection, then try again.");
    renderSessions(saveSession({
      id: crypto.randomUUID(),
      kind: "session",
      label: "Tonight: guided reset",
      text: `${concern}${extra ? ` — ${extra}` : ""}`,
      createdAt: "Just now"
    }));
  } catch (error) {
    showError(error.name === "AbortError" ? "This is taking longer than expected. Please check the key and your internet connection, then try again." : (error.message || "I could not reach the sleep guide. Please check the key and try again."));
  } finally {
    clearTimeout(timeout);
    setLoading(false);
  }
});

document.querySelector("#start-over").addEventListener("click", () => {
  result.hidden = true;
  errorMessage.hidden = true;
  form.reset();
  document.querySelector("#coach-title").scrollIntoView({ behavior: "smooth", block: "center" });
});

renderSessions();
