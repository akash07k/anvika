/**
 * Refresh the committed models.dev enrichment snapshot. Fetches the public, keyless models.dev catalog
 * and rewrites apps/server/src/models/enrichment/snapshot.json as `type -> model -> ModelMeta` for the
 * connection types Anvika prices. Run manually when prices drift:
 *
 *   bun run tooling/refresh-models-snapshot.ts
 *
 * Content-safe: the catalog carries no secrets; this logs only counts.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

interface ModelMeta {
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
}

const ModelEntrySchema = z.object({
  cost: z.object({ input: z.number().optional(), output: z.number().optional() }).optional(),
  limit: z.object({ context: z.number().optional(), output: z.number().optional() }).optional(),
});

const ProviderEntrySchema = z.object({
  models: z.record(z.string(), ModelEntrySchema).optional(),
});

const CatalogSchema = z.record(z.string(), ProviderEntrySchema);

const PROVIDER_KEYS: Record<string, string[]> = {
  anthropic: ['anthropic'],
  openai: ['openai'],
  google: ['google'],
  xai: ['xai', 'x-ai'],
  openrouter: ['openrouter'],
};

const res = await fetch('https://models.dev/api.json');
if (!res.ok) {
  process.stderr.write(`models.dev fetch failed: ${res.status}\n`);
  process.exit(1);
}
const parsed = CatalogSchema.safeParse(await res.json());
if (!parsed.success) {
  process.stderr.write('models.dev catalog malformed; refusing to write snapshot\n');
  process.exit(1);
}
const catalog = parsed.data;

const snapshot: Record<string, Record<string, ModelMeta>> = {};
let count = 0;
for (const [type, keys] of Object.entries(PROVIDER_KEYS)) {
  const models: Record<string, ModelMeta> = {};
  for (const key of keys) {
    for (const [model, entry] of Object.entries(catalog[key]?.models ?? {})) {
      models[model] = {
        inputPrice: entry.cost?.input ?? null,
        outputPrice: entry.cost?.output ?? null,
        contextWindow: entry.limit?.context ?? null,
        maxOutputTokens: entry.limit?.output ?? null,
      };
      count += 1;
    }
  }
  snapshot[type] = models;
}

const outPath = resolve(
  import.meta.dir,
  '..',
  'apps',
  'server',
  'src',
  'models',
  'enrichment',
  'snapshot.json',
);
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`Wrote ${count} model entries to ${outPath}\n`);
