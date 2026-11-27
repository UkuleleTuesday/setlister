// The room's writes, through the only shapes the rules allow it (sync.ts).

import { notices } from "./notices.svelte.js";
import * as sync from "./sync.js";

export function sendRoomWrite(write: Promise<void>, failure: string) {
  write.catch((err) => {
    console.warn(failure, err);
    notices.requests.show(failure);
    sync.refresh().catch(() => {});
  });
}
