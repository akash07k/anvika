import { Command } from 'commander';

import { resolveBootstrapConfig } from './config/bootstrap';
import { startServer } from './server';
import type { ServerDeps } from './server';

/**
 * Parse argv and run the requested command.
 *
 * @param argv - The argument vector to parse (typically `process.argv.slice(2)`
 *   or the full `process.argv`; commander normalises both).
 * @param deps - Mode-specific dependencies injected by the entrypoint.
 */
export async function runCli(argv: readonly string[], deps: ServerDeps): Promise<void> {
  const program = new Command();
  program.name('anvika').description('Anvika accessible AI application');

  program
    .command('serve', { isDefault: true })
    .description(
      'Start the Anvika server and open the browser (the default when run with no command)',
    )
    .option('-p, --port <number>', 'port to listen on')
    .option('-d, --data-dir <path>', 'application data directory')
    .option('--no-open', 'do not open the browser')
    .option('--log-content', 'log message content to the server logs (development only)')
    .option('--log-level <level>', 'lowest log level (trace|debug|info|warning|error|fatal)')
    .option('--log-category <pair...>', 'per-category level override, e.g. client.keyboard=debug')
    .action(
      async (opts: {
        port?: string;
        dataDir?: string;
        open?: boolean;
        logContent?: boolean;
        logLevel?: string;
        logCategory?: string[];
      }) => {
        const cfg = resolveBootstrapConfig({
          flags: {
            port: opts.port,
            dataDir: opts.dataDir,
            open: opts.open,
            logContent: opts.logContent,
            logLevel: opts.logLevel,
            logCategory: opts.logCategory,
          },
          env: process.env,
        });
        await startServer(cfg, deps);
      },
    );

  await program.parseAsync([...argv], { from: 'user' });
}
