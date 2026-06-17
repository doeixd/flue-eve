declare module "@vercel/connect/eve" {
  import type { ConnectAuthorizationProvider, VercelConnectAuthSpec } from "./vercel-connect.js";

  export function connect(spec: VercelConnectAuthSpec): ConnectAuthorizationProvider;
}