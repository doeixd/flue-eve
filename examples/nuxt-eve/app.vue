<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Client } from "@flue-eve/client";

const status = ref("disconnected");
const messages = ref<{ role: string; content: string }[]>([]);
const input = ref("");
let client: Client | null = null;

onMounted(async () => {
  client = new Client({ baseUrl: "/eve/v1" });
  try {
    await client.health();
    status.value = "ready";
  } catch {
    status.value = "error";
  }
});

async function send() {
  if (!input.value.trim() || !client) return;
  const msg = input.value;
  input.value = "";
  status.value = "sending";
  messages.value.push({ role: "user", content: msg });

  try {
    const session = await client.createSession({ message: msg });
    for await (const event of session.stream()) {
      if (event.type === "message.completed" && event.data?.content) {
        messages.value.push({ role: "assistant", content: event.data.content });
      }
      if (event.type === "session.waiting" || event.type === "session.completed") {
        status.value = "ready";
      }
    }
  } catch (e: any) {
    status.value = "error";
    messages.value.push({ role: "system", content: `Error: ${e.message}` });
  }
}
</script>

<template>
  <main>
    <h1>Nuxt + flue-eve</h1>
    <p>Status: {{ status }}</p>

    <div id="messages">
      <p v-for="(msg, i) in messages" :key="i">
        <strong>{{ msg.role }}:</strong> {{ msg.content }}
      </p>
    </div>

    <form @submit.prevent="send">
      <input v-model="input" placeholder="Type a message..." :disabled="status === 'sending'" />
      <button type="submit" :disabled="status === 'sending' || !input.trim()">Send</button>
    </form>
  </main>
</template>

<style>
main { max-width: 640px; margin: 2rem auto; font-family: system-ui, sans-serif; }
#messages { margin: 1rem 0; }
input { width: 70%; padding: 0.5rem; }
button { padding: 0.5rem 1rem; }
</style>
