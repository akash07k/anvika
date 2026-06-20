import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { buildSections } from './conversationBuckets';
import { ConversationListItem } from './ConversationListItem';

/** Props for {@link ConversationSections}. */
export interface ConversationSectionsProps {
  /** The full conversation list, already sorted `updatedAt`-DESC by the server. */
  conversations: ConversationSummary[];
}

/**
 * Render the conversation list as an accordion of time-grouped, screen-reader-navigable sections.
 *
 * The pure {@link buildSections} helper does all the bucketing; this component is the boundary where
 * the wall clock is read (`now = Date.now()/1000`, in unix-epoch seconds) and injected, so the helper
 * stays deterministic and the clock is never touched inside it. `buildSections` returns the ordered,
 * non-empty sections (Pinned, Recent, then the five time buckets); each becomes an `AccordionItem`
 * whose trigger is a level-3 heading button named by the section label and whose panel lists the rows.
 * Each `AccordionItem` carries a stable DOM id `section-item-${section.id}` so a focus helper can target
 * a section's (always-mounted) trigger button even when the section is collapsed and its rows are
 * unmounted - the pinned-list focus shortcut uses `#section-item-pinned`'s trigger as its
 * collapsed-section fallback. The id is placed on the `AccordionItem` (not the trigger) so Radix's
 * trigger-derived `aria-labelledby` on the content region is preserved; putting our id on the trigger
 * would strip the region's accessible name.
 *
 * Pinned and Recent default to EXPANDED (`defaultValue`) because they are the everyday shortcuts that
 * repeat the most relevant conversations; the time buckets - the full archive - default to collapsed
 * so the nav opens compact. A conversation repeated in a non-Pinned section is rendered with
 * `showPinnedSuffix` and a section-scoped id so the duplicate stays a valid, distinct DOM node.
 *
 * @param props - See {@link ConversationSectionsProps}.
 */
export function ConversationSections({ conversations }: ConversationSectionsProps) {
  const now = Math.floor(Date.now() / 1000);
  const sections = buildSections(conversations, now);
  return (
    <Accordion type="multiple" defaultValue={['pinned', 'recent']}>
      {sections.map((section) => (
        <AccordionItem key={section.id} value={section.id} id={`section-item-${section.id}`}>
          <AccordionTrigger>{section.label}</AccordionTrigger>
          <AccordionContent>
            <ul>
              {section.items.map((item) => (
                <ConversationListItem
                  key={item.summary.id}
                  summary={item.summary}
                  sectionId={section.id}
                  showPinnedSuffix={item.showPinnedSuffix}
                />
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
