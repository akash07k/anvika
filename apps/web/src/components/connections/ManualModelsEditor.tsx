import { useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * An accessible add/remove editor for a connection's manual model IDs (the explicit model list used
 * when a provider exposes no listing endpoint). Clicking "Add manual model" appends a row and moves
 * focus to its model-id input. Each "Remove" button takes its accessible name by COMPOSITION via
 * `aria-labelledby` - the button's own visible text plus the row's model-id field - so it resolves to
 * e.g. "Remove model gpt-4o" without a hand-authored `aria-label`.
 */
export function ManualModelsEditor({
  ids,
  onChange,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // A pending focus request: a row input by index, or the Add button when the list emptied. Applied
  // after the change commits so the target is mounted (matches ConnectionsFieldset's pattern).
  const [focusTarget, setFocusTarget] = useState<{ index: number } | 'add' | null>(null);

  // After the change commits, move focus to the requested model input (or the Add button), then clear.
  useLayoutEffect(() => {
    if (focusTarget === null) return;
    if (focusTarget === 'add') addButtonRef.current?.focus();
    else {
      const id = `${baseId}-model-${focusTarget.index}`;
      containerRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`)?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget, baseId]);

  const update = (index: number, value: string): void => {
    onChange(ids.map((id, i) => (i === index ? value : id)));
  };

  const add = (): void => {
    onChange([...ids, '']);
    setFocusTarget({ index: ids.length });
  };

  const remove = (index: number): void => {
    const next = ids.filter((_, i) => i !== index);
    onChange(next);
    // Keep focus in the editor: move to the next-then-previous remaining row's input, or to the Add
    // button when the list is now empty (otherwise focus would drop to <body>).
    setFocusTarget(next.length === 0 ? 'add' : { index: Math.min(index, next.length - 1) });
  };

  return (
    <div ref={containerRef}>
      <h4>Manual model IDs</h4>
      <p>
        Optional. List model IDs by hand when the provider exposes no model-listing endpoint, or to
        pin specific models.
      </p>
      {ids.map((value, index) => {
        const position = index + 1;
        const modelId = `${baseId}-model-${index}`;
        const modelLabelId = `${baseId}-modellabel-${index}`;
        const removeTextId = `${baseId}-remove-${index}`;
        const modelEchoId = `${baseId}-modelecho-${index}`;
        return (
          <div key={`${baseId}-row-${index}`}>
            <label htmlFor={modelId} id={modelLabelId}>{`Model ID ${position}`}</label>
            <input
              id={modelId}
              type="text"
              value={value}
              aria-labelledby={modelLabelId}
              onChange={(event) => update(index, event.target.value)}
            />
            {/* A visible echo of the model id; it labels the Remove button by composition so the
                button reads "Remove model <id>" without recomputing the input's own label. */}
            <span id={modelEchoId}>{value}</span>
            <button
              type="button"
              id={removeTextId}
              aria-labelledby={`${removeTextId} ${modelEchoId}`}
              onClick={() => remove(index)}
            >
              Remove model
            </button>
          </div>
        );
      })}
      <button type="button" ref={addButtonRef} onClick={add}>
        Add manual model
      </button>
    </div>
  );
}
