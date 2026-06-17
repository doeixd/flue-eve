<script>
  import { onMount } from "svelte";
  import { Client } from "@flue-eve/client";

  let status = $state("disconnected");
  let messages = $state([]);
  let input = $state("");
  let client;

  onMount(() => {
    client = new Client({ baseUrl: "/eve/v1" });
    client.health().then(() => { status = "ready"; }).catch(() => { status = "error"; });
  });

  async function send() {
    if (!input.trim() || !client) return;
    const msg = input;
    input = "";
    status = "sending";
    messages = [...messages, { role: "user", content: msg }];

    try {
      const session = await client.createSession({ message: msg });
      for await (const event of session.stream()) {
        if (event.type === "message.completed" && event.data?.content) {
          messages = [...messages, { role: "assistant", content: event.data.content }];
        }
        if (event.type === "session.waiting" || event.type === "session.completed") {
          status = "ready";
        }
      }
    } catch (e) {
      status = "error";
      messages = [...messages, { role: "system", content: `Error: ${e.message}` }];
    }
  }
</script>

<main>
  <h1>SvelteKit + flue-eve</h1>
  <p>Status: {status}</p>

  <div id="messages">
    {#each messages as msg}
      <p><strong>{msg.role}:</strong> {msg.content}</p>
    {/each}
  </div>

  <form onsubmit={(e) => { e.preventDefault(); send(); }}>
    <input bind:value={input} placeholder="Type a message..." disabled={status === "sending"} />
    <button type="submit" disabled={status === "sending" || !input.trim()}>Send</button>
  </form>
</main>

<style>
  main { max-width: 640px; margin: 2rem auto; font-family: system-ui, sans-serif; }
  #messages { margin: 1rem 0; }
  input { width: 70%; padding: 0.5rem; }
  button { padding: 0.5rem 1rem; }
</style>
