const STORAGE_KEY = "gilgamesh-sleep-sessions-v1";

const SAMPLE_SESSIONS = [
  {
    id: "sample-argument",
    kind: "sample",
    label: "Sample story",
    text: "An argument about whose dog was bigger kept someone awake.",
    createdAt: "Sample"
  },
  {
    id: "sample-screen",
    kind: "sample",
    label: "Sample story",
    text: "Watching TV until 1 A.M. made it hard to wind down.",
    createdAt: "Sample"
  }
];

export function loadSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // Start with the sample items if local data is unavailable.
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_SESSIONS));
  return SAMPLE_SESSIONS;
}

export function saveSession(session) {
  const sessions = loadSessions();
  const updated = [session, ...sessions].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
