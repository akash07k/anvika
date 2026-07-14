import { useState } from 'react';

import { useAdvancedNewConversation } from '../../hooks/conversation/useAdvancedNewConversation';
import { useDialogTitleFocus } from '../../hooks/focus/useDialogTitleFocus';
import { USE_DEFAULT } from '../../lib/models/modelPicker';
import { useModels } from '../../hooks/conversation/useModels';
import { ModelComboboxField } from '../fields/ModelComboboxField';
import { TextField } from '../fields/TextField';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

/** Props for {@link AdvancedNewConversationDialog}. */
export interface AdvancedNewConversationDialogProps {
  /** Whether the dialog is shown; owned by AppShell. */
  open: boolean;
  /** Called on any close (Escape, Cancel, or after Create). */
  onOpenChange: (open: boolean) => void;
}

/**
 * The advanced new-conversation dialog: an optional Title field and a model picker (with "Use
 * default model"). On Create it mints a draft, seeds the draft store, navigates to the
 * conversation with the composer focused, and durably persists a chosen title/model.
 *
 * Focus management follows the app standard ({@link useDialogTitleFocus}): the dialog title
 * receives focus on open so a screen-reader user reads top-to-bottom; Escape and Cancel close
 * and restore focus to the opener via Radix + the title-focus hook.
 *
 * @param props - See {@link AdvancedNewConversationDialogProps}.
 * @returns The advanced new-conversation dialog.
 */
export function AdvancedNewConversationDialog({
  open,
  onOpenChange,
}: AdvancedNewConversationDialogProps) {
  const { titleRef, dialogProps } = useDialogTitleFocus();
  const { create } = useAdvancedNewConversation();
  const { data: models, isPending: loading } = useModels();

  const [title, setTitle] = useState('');
  const [modelValue, setModelValue] = useState<string>(USE_DEFAULT);

  function handleCreate() {
    const model = modelValue === USE_DEFAULT ? null : modelValue;
    create({ title, model });
    onOpenChange(false);
    setTitle('');
    setModelValue(USE_DEFAULT);
  }

  function handleCancel() {
    onOpenChange(false);
    setTitle('');
    setModelValue(USE_DEFAULT);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DialogContent aria-describedby={undefined} {...dialogProps}>
        <DialogTitle ref={titleRef} tabIndex={-1}>
          New conversation
        </DialogTitle>
        <TextField
          id="advanced-conversation-title"
          label="Title (optional)"
          value={title}
          onCommit={setTitle}
          onChange={setTitle}
        />
        <ModelComboboxField
          id="advanced-conversation-model"
          label="Model"
          value={modelValue}
          models={models ?? []}
          onChange={setModelValue}
          loading={loading}
          useDefaultOption
        />
        <div>
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleCreate}>
            Create
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
