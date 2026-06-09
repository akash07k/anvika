/**
 * Stop any lingering Anvika dev or end-to-end servers by killing whatever is listening on the ports
 * they bind to - including the fallback-probe ranges, so a stale `bun dev` or an interrupted e2e run
 * never blocks the next start. Cross-platform (Windows `netstat`/`taskkill`, otherwise `lsof` + signal).
 * Run with `bun run kill`.
 *
 * Port families (see apps/server/src/config/bootstrap.ts `DEFAULT_PORT`, apps/server/src/server.ts
 * `MAX_PORT_PROBES`, apps/web/vite.config.ts, tests/e2e/playwright.config.ts):
 * - Web (Vite dev): 5173, incrementing while busy.
 * - Server: 7800, plus up to 64 interactive fallback probes (so 7800-7864). The server only probes
 *   when run in a TTY and the prompt is confirmed; otherwise it binds its exact port and fails fast.
 *   So a non-TTY server (the e2e server Playwright spawns on `--port 7820`, or `bun dev` under a pipe)
 *   does NOT probe - 7820 is covered simply because it sits inside the dev server's range.
 */
import { spawnSync } from 'node:child_process';

/** Inclusive port ranges to clear: the Vite dev range and the server's range incl. its TTY probe ceiling. */
const PORT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [5173, 5183],
  [7800, 7864],
];

const inRange = (port: number): boolean => PORT_RANGES.some(([lo, hi]) => port >= lo && port <= hi);

/** A process listening on a TCP port. */
export interface Listener {
  port: number;
  pid: number;
}

/**
 * Parse a platform's listening-TCP-socket listing into {@link Listener} pairs: Windows `netstat -ano`
 * (`TCP <local> <foreign> LISTENING <pid>`), otherwise `lsof` (`<cmd> <pid> <user> ... :<port>
 * (LISTEN)`). The user column is matched with `\S+`, not `\w+`, so a username containing a hyphen or
 * dot (e.g. `my-user`, `first.last`) still captures the correct pid instead of breaking the match.
 * Pure (takes the raw output) so it is unit-testable without spawning a process.
 *
 * @param stdout - The raw stdout of the platform's listing command.
 * @param platform - The platform whose format `stdout` is in (defaults to the current platform).
 * @returns The listening (port, pid) pairs found, in line order.
 */
export function parseListeners(stdout: string, platform: string = process.platform): Listener[] {
  const found: Listener[] = [];
  const isWindows = platform === 'win32';
  const pattern = isWindows
    ? /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/
    : /\s(\d+)\s+\S+\s+.*:(\d+)\s+\(LISTEN\)/;
  for (const line of stdout.split('\n')) {
    const [, first, second] = pattern.exec(line) ?? [];
    if (!first || !second) continue;
    // Windows captures (port, pid); lsof captures (pid, port).
    found.push(
      isWindows
        ? { port: Number(first), pid: Number(second) }
        : { pid: Number(first), port: Number(second) },
    );
  }
  return found;
}

/** Run the platform's listing command and parse its output into {@link Listener} pairs. */
function listeners(): Listener[] {
  const res =
    process.platform === 'win32'
      ? spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
      : spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  return parseListeners(res.stdout ?? '', process.platform);
}

/** Force-kill a process - its whole tree on Windows, so a `bun --watch` parent cannot respawn it. */
function killProcess(pid: number): boolean {
  if (process.platform === 'win32') {
    return spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)]).status === 0;
  }
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

const write = (line: string): void => void process.stdout.write(`${line}\n`);

/** Kill every dev/e2e listener within {@link PORT_RANGES}, reporting each process it stops. */
function main(): void {
  const handled = new Set<number>();
  let stopped = 0;
  for (const { port, pid } of listeners().filter((l) => inRange(l.port))) {
    if (pid === 0 || pid === process.pid || handled.has(pid)) continue;
    handled.add(pid);
    const ok = killProcess(pid);
    write(`${ok ? 'stopped' : 'could not stop'} pid ${pid} (was listening on port ${port})`);
    if (ok) stopped += 1;
  }
  write(
    stopped === 0
      ? 'No Anvika dev or e2e servers were running on the known ports.'
      : `Stopped ${stopped} process(es) on the Anvika dev/e2e ports.`,
  );
}

if (import.meta.main) main();
