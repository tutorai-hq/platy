import { MockTransport } from "./mock";
import type { TutorTransport } from "./types";
import { WebSocketTransport } from "./websocket";

// With no server configured, the app runs against the scripted mock. Set
// VITE_PLATY_SERVER_URL to Platy's own server to use the real one.
export function createTransport(): TutorTransport {
  const url = import.meta.env.VITE_PLATY_SERVER_URL as string | undefined;
  return url ? new WebSocketTransport(url) : new MockTransport();
}

/** True when the app runs on the scripted mock, with no server configured. */
export function usesMock(): boolean {
  return !import.meta.env.VITE_PLATY_SERVER_URL;
}
