import { useSyncExternalStore } from "react";

import { getToken, subscribeToToken } from "../api/client";

export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribeToToken, () => getToken() !== null);
}
