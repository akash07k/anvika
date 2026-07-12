import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedSettings } from '../support/seed';

/** A seeded conversation: a fixed, valid `xxx-xxx` Crockford base32 id and its unique title. */
export interface SeedConv {
  id: string;
  title: string;
}

/** Three seeded conversations with distinct, collision-resistant titles and valid `xxx-xxx` ids. */
export const ALPHA: SeedConv = { id: 'mna-aaa', title: 'Multinav Alpha' };
/** The second seeded conversation (see {@link ALPHA}). */
export const BETA: SeedConv = { id: 'mnb-bbb', title: 'Multinav Beta' };
/** The third seeded conversation (see {@link ALPHA}). */
export const GAMMA: SeedConv = { id: 'mnc-ccc', title: 'Multinav Gamma' };

/**
 * Configure a selected model (so the surface renders and the shared serial settings row stays
 * configured) then seed the given conversations in order via reasoning-override create-if-absent,
 * titling each through the rename endpoint so the nav row's accessible name is unambiguous.
 *
 * @param request - The Playwright API request context bound to the e2e server.
 * @param convs - The conversations to seed.
 */
export async function seedConversations(
  request: APIRequestContext,
  convs: SeedConv[],
): Promise<void> {
  await seedSettings(request, {
    selectedModelId: 'local:e2e-model',
    connections: [
      {
        id: 'local',
        label: 'Local',
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9123/v1',
        apiKey: 'sk-e2e-placeholder',
        manualModelIds: ['e2e-model'],
      },
    ],
  });
  for (const { id, title } of convs) {
    const seeded = await request.patch(`/api/v1/conversations/${id}/reasoning`, {
      data: { reasoningOverride: null },
    });
    expect(seeded.ok()).toBeTruthy();
    const titled = await request.patch(`/api/v1/conversations/${id}`, { data: { title } });
    expect(titled.ok()).toBeTruthy();
  }
}

/**
 * The conversation-list landmark, named distinctly from its in-region heading.
 *
 * @param page - The Playwright page.
 * @returns The `Conversations List` navigation landmark locator.
 */
export function navOf(page: Page) {
  return page.getByRole('navigation', { name: 'Conversations List' });
}

/**
 * Runtime-validate a `GET /api/v1/conversations` body and return its row ids in server order. Honors
 * the both-direction trust-boundary rule without casting (`as`) an un-validated `JSON.parse`: it
 * checks the body is an object whose `conversations` is an array of `{ id: string }` rows and throws
 * on any malformed shape, so a corrupt response fails the test loudly rather than silently mis-driving
 * the quick-switch assertions. The shared Zod schema is not imported here because the Node-based
 * Playwright runner cannot resolve the `@anvika/shared` workspace package; this in-spec guard
 * enforces the same contract the schema would.
 *
 * @param body - The parsed JSON response body (untrusted).
 * @returns The conversation ids in the order the server returned them.
 */
export function parseConversationIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('conversations' in body)) {
    throw new Error('conversation-list response is not an object with a conversations array');
  }
  const conversations: unknown = body.conversations;
  if (!Array.isArray(conversations)) {
    throw new Error('conversation-list response.conversations is not an array');
  }
  return conversations.map((row: unknown, index) => {
    if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string') {
      throw new Error(`conversation-list row ${index} has no string id`);
    }
    return row.id;
  });
}
