/**
 * The current Unix-epoch time in whole seconds, for the integer timestamp columns
 * (`created_at`, `updated_at`). Shared by the Drizzle write/active/branch modules so the one
 * truncation rule (`Math.floor`) lives in a single place.
 *
 * @returns The current time as whole Unix-epoch seconds.
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
