import type { FlueConnectionDefinition } from "flue-eve/connections";

/** Static Linear catalog for Eve /info + connection__search (no API key required). */
export const linearDefinition: FlueConnectionDefinition = {
  name: "linear",
  description: "Linear workspace: issues, projects, cycles.",
  tools: [
    {
      name: "list_issues",
      description: "List issues in a Linear workspace",
      qualifiedName: "connection__linear__list_issues",
    },
    {
      name: "create_issue",
      description: "Create a new Linear issue",
      qualifiedName: "connection__linear__create_issue",
    },
  ],
};