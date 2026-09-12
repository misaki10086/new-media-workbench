const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingState {
  platform: string;
  expiresAt: number;
}

const pendingStates = new Map<string, PendingState>();

export function createOAuthState(platform: string): string {
  const state = crypto.randomUUID();
  pendingStates.set(state, { platform, expiresAt: Date.now() + STATE_TTL_MS });
  for (const [key, value] of pendingStates) {
    if (value.expiresAt < Date.now()) pendingStates.delete(key);
  }
  return state;
}

export function consumeOAuthState(state: string | undefined, platform: string): boolean {
  if (!state) return false;
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(pending && pending.platform === platform && pending.expiresAt >= Date.now());
}
