import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The property name on `window` under which recorded announcements are stored. A plain (non-dangling)
 * identifier so it satisfies the repo's `no-underscore-dangle` lint rule, while staying unlikely to
 * collide with any app global.
 */
const NOTICES_KEY = 'anvikaNotices';

/**
 * The `document` augmentation the announcement recorder installs. In a real Chromium `announce()`
 * calls `document.ariaNotify`, which leaves NO DOM artifact - so to assert spoken announcements the
 * recorder overrides `ariaNotify` to push each message into a captured array exposed on `window`.
 */
interface NoticeDocument extends Document {
  /** The web ariaNotify API the app calls; the recorder replaces it with a push-to-array stub. */
  ariaNotify?: (message: string) => void;
}

/**
 * Install the announcement recorder BEFORE the app loads, on every navigation. The recorder seeds a
 * fresh notices array, captures it in a local, and replaces `document.ariaNotify` with a stub that
 * pushes each message onto that captured array - so no non-null assertion is needed and a test can
 * later read the spoken announcements with {@link readNotices}. Call this before `page.goto`
 * (Playwright re-runs init scripts on every navigation, so a reload re-arms a fresh recorder - read
 * notices before reloading if the pre-reload set matters).
 *
 * @param page - The Playwright page to arm.
 * @returns A promise that resolves once the init script is registered.
 */
export async function recordAnnouncements(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const notices: string[] = [];
    (window as Window & Record<string, unknown>)[key] = notices;
    (document as NoticeDocument).ariaNotify = (message: string): void => {
      notices.push(message);
    };
  }, NOTICES_KEY);
}

/**
 * Read the announcement strings recorded so far for the current document. Returns an empty array when
 * the recorder has not captured anything yet (or was reset by a navigation), never `undefined`.
 *
 * @param page - The Playwright page whose recorder to read.
 * @returns The ordered announcement strings captured since the recorder was installed.
 */
export function readNotices(page: Page): Promise<string[]> {
  return page.evaluate((key: string) => {
    const value = (window as Window & Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as string[]) : [];
  }, NOTICES_KEY);
}

/**
 * Wait until a specific announcement string has been recorded, polling the recorder. Announcements
 * are asynchronous (they fire from notification effects), so a bare read can race the speak; this
 * polls the recorded notices until the expected message appears or the assertion times out.
 *
 * @param page - The Playwright page whose recorder to poll.
 * @param message - The EXACT announcement string expected (never paraphrase the wording).
 */
export async function expectAnnounced(page: Page, message: string): Promise<void> {
  await expect(async () => {
    const notices = await readNotices(page);
    expect(notices).toContain(message);
  }).toPass();
}

/**
 * Assert zero axe violations on the current page across the repo's WCAG tag set (2.0 A, 2.0 AA,
 * 2.2 AA). Shared by every connections spec so each flow proves its end state is accessible.
 *
 * @param page - The Playwright page to audit.
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/**
 * The settings store renders the form only once it has hydrated; the announcement-period spinbutton
 * becoming visible is the agreed ready-signal (mirrors settings-persistence.spec.ts). Await this
 * after navigating to `/settings` before driving the connections UI.
 *
 * @param page - The Playwright page sitting on `/settings`.
 */
export async function waitForSettingsHydrated(page: Page): Promise<void> {
  await expect(page.getByRole('spinbutton', { name: /announcement period/i })).toBeVisible();
}

/**
 * Open the inline "Add connection" form and assert its `<h3>` heading received focus, the orientation
 * contract a screen-reader user relies on. Returns once the heading is focused so the caller can fill
 * the form immediately.
 *
 * @param page - The Playwright page sitting on a hydrated `/settings`.
 */
export async function openAddForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add connection' }).click();
  const heading = page.getByRole('heading', { level: 3, name: 'Add connection' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
}

/**
 * Type a label and (optionally) an API key into the OPEN add/edit form. The API key field has no
 * inner Save button: it commits the typed key into the draft on BLUR (commit-on-blur), so the key is
 * captured by blurring the textbox. The API key field's accessible name is `API key`.
 *
 * Does NOT click "Save connection" - the caller arms the appropriate response waits first, then saves
 * with {@link saveConnection}, so the two-call save (PATCH then secret PUT) can be observed.
 *
 * @param page - The Playwright page with the connection form open.
 * @param fields - The label to type, and an optional API key to type and commit on blur.
 */
export async function fillConnectionForm(
  page: Page,
  fields: { label?: string; apiKey?: string },
): Promise<void> {
  if (fields.label !== undefined) {
    await page.getByLabel('Label').fill(fields.label);
  }
  if (fields.apiKey !== undefined) {
    // Target the key textbox by exact role+name: the "Show API key" button also carries the
    // "API key" substring, so a getByLabel substring match would be ambiguous.
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill(fields.apiKey);
    // Commit the typed key into the draft (and mark it dirty) by blurring - the save then fires the
    // secret PUT. There is no inner "Save API key" button; the form's Save is the single save.
    await page.getByRole('textbox', { name: 'API key', exact: true }).blur();
  }
}

/**
 * Click the form's "Save connection" button. Arm any `page.waitForResponse` promises BEFORE calling
 * this so the resulting PATCH (and secret PUT, when a key changed) cannot be missed.
 *
 * @param page - The Playwright page with the connection form open.
 */
export async function saveConnection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save connection' }).click();
}

/**
 * Arm a wait for the connections settings PATCH (the public write of the connections array). Returns
 * the in-flight promise; await it AFTER triggering the save. Matches a 200 PATCH to `/api/v1/settings`.
 *
 * @param page - The Playwright page.
 * @returns A promise resolving when the settings PATCH settles 200.
 */
export function waitForSettingsPatch(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/settings') &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  );
}

/**
 * Arm a wait for the per-connection secret PUT (the second call of the secret-safe two-call save).
 * Returns the in-flight promise; await it AFTER triggering a save that carried a typed key. Matches a
 * 200 PUT whose URL contains `/api/v1/connections/` (the id segment is `<id>/secret`).
 *
 * @param page - The Playwright page.
 * @returns A promise resolving when the secret PUT settles 200.
 */
export function waitForSecretPut(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/connections/') &&
      r.request().method() === 'PUT' &&
      r.status() === 200,
  );
}
