// Cloud build: the last notes and study data this device loaded, kept in IndexedDB so the next
// launch can show them at once. Firebase sign-in and the first Firestore reads take a few
// seconds; the app paints from this copy meanwhile and swaps in fresh data when it arrives.
// It holds nothing the Firestore offline cache doesn't already keep on the device, and
// signing out (or a refused or different account) wipes it. Locally nothing is kept.

const DB = "atlas-snapshot";
const STORE = "kv";
const OWNER = "atlas-snapshot-owner";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** The account the kept copy belongs to (set once that account was let in), if any. */
export function snapshotOwner(): string | null {
  try {
    return localStorage.getItem(OWNER);
  } catch {
    return null;
  }
}

export function setSnapshotOwner(uid: string) {
  try {
    localStorage.setItem(OWNER, uid);
  } catch {
    /* storage unavailable: no instant start next time */
  }
}

export async function readSnapshot<T>(key: string): Promise<T | undefined> {
  if (!snapshotOwner()) return undefined;
  try {
    return (await run("readonly", (s) => s.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

const timers = new Map<string, number>();

/** Keeps `value()` under `key`, a moment after the last change (changes come in bursts). */
export function writeSnapshot(key: string, value: () => unknown) {
  if (!snapshotOwner()) return;
  window.clearTimeout(timers.get(key));
  timers.set(
    key,
    window.setTimeout(() => {
      if (snapshotOwner()) void run("readwrite", (s) => s.put(value(), key)).catch(() => undefined);
    }, 800),
  );
}

export async function clearSnapshot() {
  try {
    localStorage.removeItem(OWNER);
  } catch {
    /* storage unavailable */
  }
  timers.forEach((t) => window.clearTimeout(t));
  timers.clear();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
