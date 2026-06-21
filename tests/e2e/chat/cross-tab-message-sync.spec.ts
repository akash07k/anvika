import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

const hasAzure = Boolean(
  process.env.ANVIKA_AZURE_API_KEY &&
  process.env.ANVIKA_AZURE_RESOURCE_NAME &&
  process.env.ANVIKA_AZURE_DEPLOYMENT,
);

// Mirror the sibling live specs (chat-live, conversation-persistence): the turn needs a real model,
// resolved from the owner's seeded settings. Gate on creds so credential-free CI skips cleanly
// instead of timing out on an assistant reply that can never arrive.
test.skip(!hasAzure, 'requires Azure credentials in env (.env)');

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('syncs a new turn live into a second tab on the same conversation', async ({
  page,
  request,
}) => {
  // Two real model round-trips (first turn, then second turn) plus cross-tab propagation exceed the
  // 30s default per-test budget; the sibling live specs each do a single turn. Raise it generously so
  // a slow-but-correct provider response never trips a premature test-level timeout.
  test.setTimeout(120_000);

  // Seed the owner's settings (Azure credential + selected model id) via the API, exactly as
  // chat-live.spec.ts does. Settings live server-side in the shared e2e SQLite DB, so BOTH tabs
  // resolve the same configured model - tab B needs no per-tab client setup.
  const deployment = process.env.ANVIKA_AZURE_DEPLOYMENT ?? '';
  await seedSettings(request, {
    connections: [
      {
        id: 'azure-main',
        label: 'Azure',
        type: 'azure',
        apiKey: process.env.ANVIKA_AZURE_API_KEY,
        resourceName: process.env.ANVIKA_AZURE_RESOURCE_NAME,
        // Azure has no data-plane model listing, so membership comes solely from manual ids; list
        // the deployment so it appears in GET /api/v1/models and readiness can resolve to 'ready'.
        manualModelIds: [deployment],
      },
    ],
    selectedModelId: `azure-main:${deployment}`,
  });

  // Tab A: send a first message so a conversation row exists and we land on its /c/:id URL.
  await page.goto('/');
  const composerA = page.getByRole('textbox', { name: 'Message' });
  await expect(composerA).toBeVisible();
  await composerA.fill('Reply with the single word: hello.');
  const sendA = page.getByRole('button', { name: 'Send' });
  await sendA.click();

  // Assert on the last assistant listitem - our just-sent turn's reply.
  const assistantA = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Assistant' }) });
  await expect(assistantA.last()).toBeVisible({ timeout: 30000 });
  await expect(assistantA.last()).toContainText(/\w/, { timeout: 30000 });

  // The turn persists in the stream's onFinish (server side) once the stream fully completes. The
  // composer is disabled while a response is in flight, so Send re-enabling confirms the stream
  // finished and the turn was saved - the `conversation-updated` broadcast fires on that persistence.
  await expect(sendA).toBeEnabled({ timeout: 30000 });

  // Capture the conversation URL after the first turn settles (the entry route redirects to /c/:id).
  await expect(page).toHaveURL(/\/c\//);
  const conversationUrl = page.url();

  // Count the assistant turns now visible in tab A so we can assert tab B grows past this baseline.
  const baselineAssistantCount = await assistantA.count();

  // Tab B: a SECOND page in the SAME browser context as tab A. Two tabs in one browser profile is
  // exactly the real-world cross-tab scenario, and it is the ONLY way to exercise the sync: a
  // BroadcastChannel is partitioned per browsing-context group, so two ISOLATED `browser.newContext()`
  // profiles would NOT share the channel and the `conversation-updated` signal would never cross. Settings
  // are server-side (shared DB), so tab B needs no client setup - just navigate to the same conversation.
  const pageB = await page.context().newPage();
  try {
    await pageB.goto(conversationUrl);
    await expect(pageB.getByRole('textbox', { name: 'Message' })).toBeVisible();
    const messagesB = pageB.getByRole('list', { name: 'Messages' });
    await expect(
      messagesB.getByText('Reply with the single word: hello.', { exact: true }).last(),
    ).toBeVisible({ timeout: 30000 });
    const assistantB = pageB
      .getByRole('listitem')
      .filter({ has: pageB.getByRole('heading', { name: 'Assistant' }) });
    await expect(assistantB).toHaveCount(baselineAssistantCount, { timeout: 30000 });

    // Tab A: send a SECOND message and wait for that turn to fully complete (Send re-enabled), so the
    // persistence write - and thus the cross-tab `conversation-updated` broadcast - has fired.
    const secondPrompt = 'Reply with the single word: world.';
    await composerA.fill(secondPrompt);
    await sendA.click();
    await expect(assistantA).toHaveCount(baselineAssistantCount + 1, { timeout: 30000 });
    await expect(sendA).toBeEnabled({ timeout: 30000 });

    // Tab B: NO reload, NO goto. The BroadcastChannel `conversation-updated` invalidates the detail
    // query, which re-seeds the transcript via useChat. Auto-retrying web-first assertions wait for
    // that propagation. Assert BOTH the new user text and a grown assistant-turn count.
    //
    // This proves the SYNC FEATURE drives the update, not an incidental refetch: these are read-only
    // web-first assertions, which poll the DOM without focusing tab B, so they never fire the
    // `refetchOnWindowFocus` path; and the detail query is `staleTime: Infinity`, so tab B never
    // refetches on its own. The shared e2e DB is identical whether the tabs share a context or not -
    // yet the same test against two ISOLATED `browser.newContext()` profiles FAILS here (tab B stays
    // stale), because the BroadcastChannel cannot cross context groups. Same-context passing is
    // therefore caused by the broadcast-driven re-seed, the exact behaviour under test.
    await expect(messagesB.getByText(secondPrompt, { exact: true }).last()).toBeVisible({
      timeout: 30000,
    });
    await expect(assistantB).toHaveCount(baselineAssistantCount + 1, { timeout: 30000 });
  } finally {
    // Close only tab B's page; the shared context (and tab A) is owned by the test fixture and is
    // torn down automatically. Closing the context here would also close tab A mid-teardown.
    await pageB.close();
  }
});
