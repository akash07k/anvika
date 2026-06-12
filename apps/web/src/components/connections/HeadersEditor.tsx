import { useId, useLayoutEffect, useRef, useState } from 'react';

/** One header row in the draft: a name, an optional newly-typed value, and the stored-set flag. */
export interface HeaderRow {
  /** The header name (the wire key). */
  name: string;
  /** A value typed this session, or `undefined` when none was entered. */
  value?: string | undefined;
  /** Whether a value is already stored for this header (edit mode), shown as "Set". */
  isSet: boolean;
}

/**
 * An accessible add/remove editor for a connection's custom headers. Each row pairs a header-name
 * field with a value field; the value renders write-only ("Set" + the option to re-enter) when a
 * value is already stored, mirroring {@link SecretField}'s secret discipline so a header value is
 * never displayed. Clicking "Add header" appends a row and moves focus to its name input. Each
 * "Remove" button takes its accessible name by COMPOSITION via `aria-labelledby` - the button's own
 * visible text plus the row's name field - so it resolves to e.g. "Remove header Authorization"
 * without a hand-authored `aria-label`.
 */
export function HeadersEditor({
  rows,
  onChange,
}: {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}) {
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // A pending focus request: a row name input by index, or the Add button when the list emptied. It
  // is applied after the change commits so the target is mounted (matches ConnectionsFieldset).
  const [focusTarget, setFocusTarget] = useState<{ index: number } | 'add' | null>(null);

  // After the change commits, move focus to the requested name input (or the Add button), then clear.
  useLayoutEffect(() => {
    if (focusTarget === null) return;
    if (focusTarget === 'add') addButtonRef.current?.focus();
    else {
      const id = `${baseId}-name-${focusTarget.index}`;
      containerRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`)?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget, baseId]);

  const update = (index: number, patch: Partial<HeaderRow>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const add = (): void => {
    onChange([...rows, { name: '', isSet: false }]);
    setFocusTarget({ index: rows.length });
  };

  const remove = (index: number): void => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next);
    // Keep focus in the editor: move to the next-then-previous remaining row's name input, or to the
    // Add button when the list is now empty (otherwise focus would drop to <body>).
    setFocusTarget(next.length === 0 ? 'add' : { index: Math.min(index, next.length - 1) });
  };

  return (
    <div ref={containerRef}>
      <h4>Custom headers</h4>
      <p>
        Optional. Extra HTTP headers sent with every request to this server, for example an
        authorization or routing header.
      </p>
      {rows.map((row, index) => {
        const position = index + 1;
        const nameId = `${baseId}-name-${index}`;
        const nameLabelId = `${baseId}-namelabel-${index}`;
        const valueId = `${baseId}-value-${index}`;
        const valueLabelId = `${baseId}-valuelabel-${index}`;
        const removeTextId = `${baseId}-remove-${index}`;
        const nameEchoId = `${baseId}-nameecho-${index}`;
        const nameHintId = `${baseId}-namehint-${index}`;
        const reEnter = row.isSet && row.value === undefined;
        return (
          <div key={`${baseId}-row-${index}`}>
            <label htmlFor={nameId} id={nameLabelId}>{`Header name ${position}`}</label>
            <input
              id={nameId}
              type="text"
              value={row.name}
              aria-labelledby={nameLabelId}
              aria-describedby={row.isSet ? nameHintId : undefined}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            {/* A stored header keeps its value keyed by name; renaming it without re-entering the value
                drops the secret (see assembleSecretPatch). A non-live hint warns of that, content-safe. */}
            {row.isSet ? (
              <span id={nameHintId}>
                Renaming clears the stored value; re-enter it to keep this header.
              </span>
            ) : null}
            {/* A visible echo of the header name; it labels the Remove button by composition so the
                button reads "Remove header <name>" without recomputing the input's own label. */}
            <span id={nameEchoId}>{row.name}</span>
            {/* The value label's `htmlFor` points at the value input, which exists ONLY in the
                else branch. In the reEnter branch there is no such input, so the label carries no
                `htmlFor` (it would dangle); the "Set" span borrows the label via `aria-labelledby`
                instead, mirroring {@link SecretField}'s set-state association. */}
            <label htmlFor={reEnter ? undefined : valueId} id={valueLabelId}>
              {`Header value ${position}`}
            </label>
            {reEnter ? (
              <span>
                <span aria-labelledby={valueLabelId}>Set</span>
                <button type="button" onClick={() => update(index, { value: '' })}>
                  {`Replace header value ${position}`}
                </button>
              </span>
            ) : (
              <input
                id={valueId}
                type="password"
                value={row.value ?? ''}
                aria-labelledby={valueLabelId}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            )}
            <button
              type="button"
              id={removeTextId}
              aria-labelledby={`${removeTextId} ${nameEchoId}`}
              onClick={() => remove(index)}
            >
              Remove header
            </button>
          </div>
        );
      })}
      <button type="button" ref={addButtonRef} onClick={add}>
        Add header
      </button>
    </div>
  );
}
