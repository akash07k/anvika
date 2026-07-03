import type { ConversationModel } from '../hooks/conversation/useConversationModel';
import type { ConversationReasoning } from '../hooks/conversation/useConversationReasoning';
import { useConnectionStatuses, useModels } from '../hooks/conversation/useModels';
import { USE_DEFAULT, selectedModelLabel } from '../lib/models/modelPicker';
import { notify } from '../notifications/notifier';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { isLoadProblem } from './connections/discoveryStatusMessage';
import { ModelComboboxField } from './fields/ModelComboboxField';
import { ReasoningEffortControl } from './ReasoningEffortControl';

/** Props for {@link ConversationSettings}. */
export interface ConversationSettingsProps {
  /** The per-conversation model override binding (from `useConversationModel`). */
  model: ConversationModel;
  /** The per-conversation reasoning override binding (from `useConversationReasoning`). */
  reasoning: ConversationReasoning;
}

/**
 * The conversation-header settings region: a labelled `<section>` holding the per-conversation
 * model picker (with a "Use default model" option) and an Advanced settings accordion that houses
 * the thinking-effort control.
 *
 * The model picker mirrors the Settings page pattern (`useModels` + `useConnectionStatuses` +
 * `isLoadProblem`) but does NOT call `useAnnounceDiscoveryProblems` - Settings owns that
 * announcement and re-calling it here would double-announce to screen-reader users.
 *
 * The Advanced settings accordion is collapsed by default, which unmounts the thinking-effort
 * control (Radix Accordion unmounts collapsed content). Tests that interact with the control
 * must expand the accordion first.
 *
 * @param props - See {@link ConversationSettingsProps}.
 * @returns The conversation settings region.
 */
export function ConversationSettings({ model, reasoning }: ConversationSettingsProps) {
  const { data: models, isPending } = useModels();
  const { data: statuses } = useConnectionStatuses();
  const discoveryProblem = (statuses ?? []).some((s) => isLoadProblem(s.outcome));

  /**
   * Handle a model pick: map the USE_DEFAULT sentinel back to `null` (inherit), write the override,
   * and fire the content-safe model-changed announcement (model label only - never a conversation
   * id, title, or message text) ONLY on a successful write. Announcing optimistically would let a
   * failed write contradict itself for a screen-reader user ("Model set to X" then "Could not change
   * the model"); `onModelChange` resolves `false` and announces the failure itself in that case.
   */
  const handlePick = (value: string) => {
    const next = value === USE_DEFAULT ? null : value;
    // Announce a natural phrase for the inherit case: the raw "Use default model" label reads awkwardly
    // as "Model set to Use default model" for a screen-reader user. A concrete pick announces its label.
    const announced = next === null ? 'the default model' : selectedModelLabel(value, models ?? []);
    void model.onModelChange(next).then((ok) => {
      if (ok) {
        notify({ type: 'conversationModelChanged', model: announced });
      }
    });
  };

  return (
    <section aria-label="Conversation settings">
      <ModelComboboxField
        id="conversation-model"
        label="Model"
        value={model.modelId ?? USE_DEFAULT}
        models={models ?? []}
        loading={isPending}
        discoveryProblem={discoveryProblem}
        useDefaultOption
        onChange={handlePick}
      />
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced settings</AccordionTrigger>
          <AccordionContent>
            <ReasoningEffortControl
              value={reasoning.override}
              capable={reasoning.capable}
              onChange={reasoning.onEffortChange}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
