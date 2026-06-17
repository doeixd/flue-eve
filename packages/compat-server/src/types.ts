import type { ConnectionRegistry } from "@flue-eve/connections";
import type { FlueEvent } from "@flue-eve/shared";

import type { JournalPersistenceAdapter } from "./journal-persistence.js";
import type { InputResponse } from "./session-body.js";

export type EveSessionStatus = "active" | "waiting" | "completed" | "failed";

export type EveAuthPolicy = "none" | "local-dev" | { bearer?: string };

export interface AdmitTurnInput {
  readonly agentName: string;
  readonly sessionId: string;
  readonly message: string;
  readonly isFirstTurn: boolean;
  readonly inputResponses?: readonly InputResponse[];
  readonly outputSchema?: Record<string, unknown>;
  readonly clientContext?: string | readonly string[] | Record<string, unknown>;
}

export interface FlueAdmissionAdapter {
  admitTurn(input: AdmitTurnInput): AsyncIterable<FlueEvent>;
}

export interface EveCompatOptions {
  readonly agentName: string;
  readonly agents?: readonly EveAgentConfig[];
  readonly mount?: string;
  readonly auth?: EveAuthPolicy;
  readonly journal?: { readonly maxEvents?: number };
  readonly persistence?: JournalPersistenceAdapter;
  readonly admission?: FlueAdmissionAdapter;
  readonly modelId?: string;
  readonly instructions?: string;
  readonly tools?: readonly { readonly name: string; readonly description?: string }[];
  readonly connections?: ConnectionRegistry;
}

export interface EveResolvedAgentConfig {
  readonly name: string;
  readonly description: string;
  readonly modelId: string;
  readonly tools: readonly { readonly name: string; readonly description?: string }[];
}

export interface EveAgentConfig {
  readonly name: string;
  readonly description?: string;
  readonly modelId?: string;
  readonly tools?: readonly { readonly name: string; readonly description?: string }[];
}
