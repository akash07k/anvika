import { useEffect, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

import type { ModelInfo } from '@anvika/shared/models/model-info';

import {
  ALL,
  USE_DEFAULT,
  USE_DEFAULT_LABEL,
  connectionsInModels,
  filterModels,
  matchCountCue,
  selectedModelLabel,
} from '../../lib/models/modelPicker';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { FieldShell } from './FieldShell';

/** Guidance shown when no connection is configured (and the query is not loading). */
const EMPTY_GUIDANCE = 'Add a connection above, then choose a model here.';

/** Cue shown while the models query is still loading, so the disabled trigger is not misread. */
const LOADING_CUE = 'Loading models';

/** Appended to the help text when any connection had a discovery load problem. */
const DISCOVERY_POINTER = 'One or more connections could not be reached. See Connections above.';

/** Props for {@link ModelComboboxField}. */
export interface ModelComboboxFieldProps {
  /** The control's id; label/description/error ids derive from it. */
  id: string;
  /** The visible field label; also the trigger's accessible name. */
  label: string;
  /** Optional helper text, associated via `aria-describedby`. */
  description?: string | undefined;
  /** Optional error text, rendered as non-live `aria-describedby` text (ADR 0015). */
  error?: string | undefined;
  /** The stored namespaced `connectionId:model` id, or `''` when none is selected. */
  value: string;
  /** The available models to offer, grouped by connection. */
  models: ModelInfo[];
  /** Reports the chosen namespaced model id. */
  onChange: (value: string) => void;
  /** When true, append a pointer that one or more connections could not be reached. */
  discoveryProblem?: boolean | undefined;
  /** When true, models query is still loading: trigger is disabled and cue reads "Loading models". */
  loading?: boolean | undefined;
  /**
   * When true, renders a "Use default model" option as the first item in the popover. Selecting it
   * calls `onChange` with {@link USE_DEFAULT}. Omit (or pass false) for the Settings default-model
   * selector, which always picks a concrete model and has no "inherit" concept.
   */
  useDefaultOption?: boolean | undefined;
}

/**
 * The accessible model picker: a searchable combobox (shadcn Popover + cmdk Command) grouped by
 * connection, with a native connection-scope select that narrows the candidate set before search.
 *
 * Search uses `shouldFilter={false}` so we own the predicate via {@link filterModels}: it matches
 * display name, connection label, and provider id. The first result is deterministically highlighted
 * on every query/scope/models change (controlled `Command value`). A non-live count cue makes the
 * result-set size discoverable. A loading state and a discovery pointer round it out.
 *
 * @param props - See {@link ModelComboboxFieldProps}.
 * @returns The model combobox field.
 */
export function ModelComboboxField({
  id,
  label,
  description,
  error,
  value,
  models,
  onChange,
  discoveryProblem,
  loading,
  useDefaultOption,
}: ModelComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(ALL);
  const [query, setQuery] = useState('');

  const isEmpty = models.length === 0;
  const disabled = isEmpty || Boolean(loading);
  const connections = connectionsInModels(models);

  // If the scoped connection has disappeared (e.g. it was deleted above on the settings page),
  // fall back to "all" so the picker never filters against a gone connection.
  const effectiveScope = scope === ALL || connections.some((c) => c.id === scope) ? scope : ALL;

  const matches = filterModels(models, effectiveScope, query);
  const groups = connectionsInModels(matches);
  const connectionId = `${id}-connection`;
  const cueId = `${id}-cue`;

  // Deterministically keep the first result highlighted as the user types or changes scope.
  // cmdk's own selectFirstItem fires only on search-input change; we control the highlight and
  // reset it on every query/scope/models change so arrowing (no dep change) is left untouched.
  const [highlightedId, setHighlightedId] = useState('');
  useEffect(() => {
    setHighlightedId(filterModels(models, effectiveScope, query)[0]?.id ?? '');
  }, [models, effectiveScope, query]);

  // When loading and empty, show nothing as the description (loading cue goes in the cue <p>).
  // When not loading and empty, show the add-a-connection guidance as the description.
  const baseDescription = loading ? description : isEmpty ? EMPTY_GUIDANCE : description;
  const effectiveDescription = discoveryProblem
    ? [baseDescription, DISCOVERY_POINTER].filter(Boolean).join(' ')
    : baseDescription;

  // The count cue is shown in a non-live paragraph associated via aria-describedby.
  // During loading the paragraph reads "Loading models" so the disabled state is clear.
  const cue = loading ? LOADING_CUE : matchCountCue(matches.length, effectiveScope, connections);

  return (
    <FieldShell id={id} label={label} description={effectiveDescription} error={error}>
      {({ controlId, labelId, describedBy }) => (
        <>
          <label htmlFor={connectionId} id={`${id}-connection-label`}>
            Connection
          </label>
          <select
            id={connectionId}
            value={effectiveScope}
            disabled={disabled}
            aria-labelledby={`${id}-connection-label`}
            onChange={(e) => {
              setScope(e.target.value);
              setQuery('');
            }}
          >
            <option value={ALL}>All connections</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                // The outline variant only sets foreground text on hover/expanded; pin it here so the
                // resting trigger shows the selected model in foreground (not an inherited muted grey
                // that fails WCAG AA contrast).
                className="text-foreground"
                id={controlId}
                // Self-reference controlId so the accessible name is the field label PLUS the
                // button's visible text (the selected model), so a collapsed trigger announces
                // both "Model" and the current selection - the icon is aria-hidden and excluded.
                aria-labelledby={`${labelId} ${controlId}`}
                aria-describedby={[describedBy, cueId].filter(Boolean).join(' ') || undefined}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
              >
                {selectedModelLabel(value, models)}
                <ChevronsUpDown aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0">
              <Command value={highlightedId} onValueChange={setHighlightedId} shouldFilter={false}>
                <CommandInput value={query} onValueChange={setQuery} placeholder="Search models" />
                <CommandList>
                  <CommandEmpty>No models match</CommandEmpty>
                  {useDefaultOption && (
                    <CommandGroup>
                      <CommandItem
                        value={USE_DEFAULT_LABEL}
                        onSelect={() => {
                          onChange(USE_DEFAULT);
                          setOpen(false);
                        }}
                      >
                        {USE_DEFAULT_LABEL}
                      </CommandItem>
                    </CommandGroup>
                  )}
                  {groups.map((c) => (
                    <CommandGroup key={c.id} heading={c.label}>
                      {matches
                        .filter((m) => m.connectionId === c.id)
                        .map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => {
                              onChange(m.id);
                              setOpen(false);
                            }}
                          >
                            {m.displayName}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p id={cueId}>{cue}</p>
        </>
      )}
    </FieldShell>
  );
}
