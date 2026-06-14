import type { ModelInfo } from '@anvika/shared/models/model-info';

/** A connection present in the model list: its id and human label. */
export interface PickerConnection {
  /** The connection id (the value of the Connection select option). */
  id: string;
  /** The connection's human label (the visible text of the option). */
  label: string;
}

/** The connection-scope sentinel meaning every connection. */
export const ALL = 'all';

/**
 * Sentinel value that the model picker reports when the user chooses "Use default model".
 *
 * Import and compare against this constant - never use the raw string at call sites - so
 * the contract can be updated in one place.
 */
export const USE_DEFAULT = '__use_default__';

/**
 * The text shown on the combobox trigger when `value === USE_DEFAULT`.
 *
 * Imported and used by {@link ModelComboboxField} when `useDefaultOption` is true.
 */
export const USE_DEFAULT_LABEL = 'Use default model';

/**
 * Lists the distinct connections present in `models`, in first-seen order. Used to build the
 * Connection filter select; grouping is by connection (not provider type), since one connection
 * type can have several configured connections.
 *
 * @param models - The available models.
 * @returns The distinct connections (id + label) in the order they first appear.
 */
export function connectionsInModels(models: ModelInfo[]): PickerConnection[] {
  const seen = new Set<string>();
  const result: PickerConnection[] = [];
  for (const m of models) {
    if (!seen.has(m.connectionId)) {
      seen.add(m.connectionId);
      result.push({ id: m.connectionId, label: m.connectionLabel });
    }
  }
  return result;
}

/**
 * Returns the models visible under a Connection filter. `'all'` returns every model; any other value
 * returns only the models whose `connectionId` matches.
 *
 * @param filter - The active Connection filter (`'all'` or a connection id).
 * @param models - The available models.
 * @returns The models to show in the Model select.
 */
export function modelsForFilter(filter: string, models: ModelInfo[]): ModelInfo[] {
  return filter === ALL ? models : models.filter((m) => m.connectionId === filter);
}

/**
 * Whether a model matches a free-text query, case-insensitively, across its display name, connection
 * label, and provider id. An empty query matches every model.
 *
 * @param model - The model to test.
 * @param query - The user's search text.
 * @returns `true` when the model should be shown for the query.
 */
export function matchesModelQuery(model: ModelInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    model.displayName.toLowerCase().includes(q) ||
    model.connectionLabel.toLowerCase().includes(q) ||
    model.providerId.toLowerCase().includes(q)
  );
}

/**
 * The models to show for a connection scope and a query: scope narrows first (via
 * {@link modelsForFilter}), then the query filters within that scope.
 *
 * @param models - The available models.
 * @param scope - The active connection scope (`'all'` or a connection id).
 * @param query - The user's search text.
 * @returns The matching models, in input order.
 */
export function filterModels(models: ModelInfo[], scope: string, query: string): ModelInfo[] {
  return modelsForFilter(scope, models).filter((m) => matchesModelQuery(m, query));
}

/**
 * The text shown on the combobox trigger for the stored value: a prompt when nothing is selected,
 * the "use default model" label for the {@link USE_DEFAULT} sentinel, `"displayName
 * (connectionLabel)"` when the model is available, or the raw id with a "currently unavailable" cue
 * when it is not in the list (so a stored-but-gone model is still legible).
 *
 * @param value - The stored namespaced model id, `''` when nothing is selected, or {@link USE_DEFAULT}
 *   when the conversation inherits the default model.
 * @param models - The available models.
 * @returns The trigger label text.
 */
export function selectedModelLabel(value: string, models: ModelInfo[]): string {
  if (value === '') return 'Select a model';
  if (value === USE_DEFAULT) return USE_DEFAULT_LABEL;
  const match = models.find((m) => m.id === value);
  return match
    ? `${match.displayName} (${match.connectionLabel})`
    : `${value} (currently unavailable)`;
}

/**
 * The content-safe count cue for the current matches: `"N model(s)"`, plus `" from {label}"` when a
 * specific connection is scoped. Read via `aria-describedby`, so the result-set size is discoverable
 * without a chatty live region.
 *
 * @param count - The number of matching models.
 * @param scope - The active connection scope.
 * @param connections - The connections present (to resolve the scope label).
 * @returns The cue text.
 */
export function matchCountCue(
  count: number,
  scope: string,
  connections: PickerConnection[],
): string {
  const noun = count === 1 ? 'model' : 'models';
  if (scope === ALL) return `${count} ${noun}`;
  const label = connections.find((c) => c.id === scope)?.label ?? '';
  return label ? `${count} ${noun} from ${label}` : `${count} ${noun}`;
}
