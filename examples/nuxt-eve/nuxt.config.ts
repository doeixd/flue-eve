export default defineNuxtConfig({
  modules: ["@flue-eve/nuxt"],
  flueEve: {
    agentName: "assistant",
    fluePort: 3583,
    eveMount: "/eve/v1",
    spawnFlueDev: true,
  },
});
