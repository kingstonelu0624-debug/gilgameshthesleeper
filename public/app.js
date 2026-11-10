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

  try {
    const response = await fetch("/api/sleep-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concern, extra })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error === "missing-key" ? "I cannot reach the sleep guide yet. Please check the OpenAI key in .env, then restart the app." : "I could not reach the sleep guide. Please check the key and your internet connection, then try again.");
    }
    showResult(data.answer);
    renderSessions(saveSession({
      id: crypto.randomUUID(),
      kind: "session",
      label: "Tonight’s guided reset",
      text: `${concern}${extra ? ` — ${extra}` : ""}`,
      createdAt: "Just now"
    }));
  } catch (error) {
    showError(error.message || "I could not reach the sleep guide. Please check the key and try again.");
  } finally {
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
