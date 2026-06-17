import {
  createConnectionRegistry,
  createConnectionSearchTool,
  defineFlueConnection,
} from "flue-eve/connections";

import { linearDefinition } from "./linear.js";

export const connectionRegistry = createConnectionRegistry();

export const linear = defineFlueConnection(linearDefinition, connectionRegistry);

export const connectionSearchTool = createConnectionSearchTool(connectionRegistry);