import { createEveSessionPersistence, useEveAgent } from "flue-eve/react";
import { useMemo, useState } from "react";

const sessionPersistence = createEveSessionPersistence({ storage: localStorage });

export function App() {
  const { data, status, send, stop } = useEveAgent(sessionPersistence);
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const transcript = useMemo(
    () =>
      data.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      })),
    [data.messages],
  );

  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: 720,
        padding: "2rem 1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>flue-eve integrated</h1>
      <p>
        Status: {status} · Flue + Eve shim on <code>/eve/v1</code>
      </p>
      <section
        style={{
          minHeight: 280,
          border: "1px solid #d0d7de",
          borderRadius: 12,
          padding: "1rem",
          marginBottom: "1rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {transcript.map((entry) => (
          <div key={entry.id} style={{ marginBottom: "0.75rem" }}>
            <strong>{entry.role === "user" ? "You" : "Assistant"}:</strong> {entry.text}
          </div>
        ))}
      </section>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const message = draft.trim();
          if (!message || busy) return;
          setDraft("");
          await send({ message });
        }}
        style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.5rem" }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask something…"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
        <button type="button" onClick={() => stop()} disabled={!busy}>
          Stop
        </button>
      </form>
    </main>
  );
}