import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const binName = process.platform === 'win32' ? 'anvika.exe' : 'anvika';
const bin = join(import.meta.dir, '..', 'dist', binName);
const port = 7811;
const dataDir = mkdtempSync(join(tmpdir(), 'anvika-smoke-'));

const proc = Bun.spawn([bin, 'serve', '--port', String(port), '--no-open', '--data-dir', dataDir], {
  stdout: 'inherit',
  stderr: 'inherit',
});

const waitForHealth = async (url: string, timeoutMs: number): Promise<void> => {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    if (Date.now() - start > timeoutMs) throw new Error('server did not become healthy in time');
    await Bun.sleep(150);
  }
};

let failed = false;
try {
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(`${base}/api/v1/health`, 20_000);

  const root = await fetch(`${base}/`);
  const html = await root.text();
  if (!html.includes('id="root"')) throw new Error('root did not serve the SPA index.html');

  const settings = await fetch(`${base}/api/v1/settings`);
  if (!settings.ok) throw new Error(`settings route failed: ${settings.status}`);

  // A nested embedded asset referenced by index.html must resolve (proves the asset manifest).
  const assetMatch = html.match(/\/assets\/[^"']+\.js/);
  if (assetMatch) {
    const asset = await fetch(`${base}${assetMatch[0]}`);
    if (!asset.ok) throw new Error(`embedded asset ${assetMatch[0]} failed: ${asset.status}`);
  }

  if (proc.exitCode !== null) {
    throw new Error(`server exited early with code ${proc.exitCode}`);
  }

  // The binary defaults to `serve` (Commander isDefault), so launching it with no subcommand
  // (the double-click path) must also start the server. The explicit run above passes `serve`,
  // so prove the default-command path separately on its own port and data dir.
  const defaultPort = port + 1;
  const defaultDataDir = mkdtempSync(join(tmpdir(), 'anvika-smoke-default-'));
  const defaultProc = Bun.spawn(
    [bin, '--port', String(defaultPort), '--no-open', '--data-dir', defaultDataDir],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  try {
    await waitForHealth(`http://127.0.0.1:${defaultPort}/api/v1/health`, 20_000);
  } finally {
    defaultProc.kill();
    await Bun.sleep(500);
    try {
      rmSync(defaultDataDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; EBUSY on Windows is expected when the process hasn't fully exited.
    }
  }

  process.stdout.write(
    'smoke: OK (health, SPA index, settings, embedded asset, default command)\n',
  );
} catch (err) {
  failed = true;
  process.stderr.write(`smoke: FAIL ${err instanceof Error ? err.message : String(err)}\n`);
} finally {
  proc.kill();
  // On Windows the process handle is still open briefly after kill(); give it a moment
  // before attempting to remove the temp dir, and swallow EBUSY if it persists - the OS
  // will clean up %TEMP% on its own. Cleanup failure must never mask a passing smoke result.
  await Bun.sleep(500);
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; EBUSY on Windows is expected when the process hasn't fully exited.
  }
}

process.exit(failed ? 1 : 0);
