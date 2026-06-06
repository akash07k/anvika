/**
 * A single-flight runner: enqueue an async operation and it runs only after the previously enqueued
 * one settles. Shared across every settings writer so all server writes apply in order.
 */
export type SingleFlight = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * Create a single-flight queue: each enqueued operation runs only after the previous one has
 * settled (resolved or rejected), so overlapping operations never interleave. A rejection is
 * isolated to its own caller and never stalls the queue (the chain continues to the next
 * operation). The returned runner resolves or rejects with each operation's own outcome.
 *
 * @returns A {@link SingleFlight} runner that enqueues an async operation and returns its result.
 */
export function createSingleFlight(): SingleFlight {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const run = tail.then(() => operation());
    // Keep the chain alive regardless of this operation's outcome so the next one still runs.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
