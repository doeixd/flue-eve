import { Client } from "flue-eve/client";

const logEl = document.querySelector<HTMLDivElement>("#log")!;
const form = document.querySelector<HTMLFormElement>("#form")!;
const input = document.querySelector<HTMLInputElement>("#input")!;

const client = new Client();
const session = client.session();

function append(line: string) {
  logEl.textContent = `${logEl.textContent}\n${line}`.trim();
  logEl.scrollTop = logEl.scrollHeight;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  input.disabled = true;
  form.querySelector("button")!.disabled = true;

  append(`You: ${message}`);

  try {
    const response = await session.send(message);
    let assistant = "";

    for await (const streamEvent of response) {
      if (
        streamEvent.type === "message.appended" &&
        typeof streamEvent.data.messageSoFar === "string"
      ) {
        assistant = streamEvent.data.messageSoFar;
        logEl.textContent =
          `${logEl.textContent?.replace(/\nAssistant:.*$/s, "")}\nAssistant: ${assistant}`.trim();
      }
      if (streamEvent.type === "message.completed" && typeof streamEvent.data.message === "string") {
        assistant = streamEvent.data.message;
      }
    }

    append(`Assistant: ${assistant || "(no text)"}`);
  } catch (error) {
    append(`Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    input.disabled = false;
    form.querySelector("button")!.disabled = false;
    input.focus();
  }
});