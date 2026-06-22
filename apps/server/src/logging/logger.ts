import { getLogger } from '@logtape/logtape';

/**
 * Get a logger under the `anvika.server.*` category tree.
 *
 * @param sub - Zero or more sub-category segments appended after `['anvika', 'server']`.
 * @returns A LogTape logger scoped to the server subtree.
 */
export function serverLogger(...sub: readonly string[]): ReturnType<typeof getLogger> {
  return getLogger(['anvika', 'server', ...sub]);
}

/**
 * Get a logger under the `anvika.client.*` category tree, for logs forwarded from the
 * client. Client logs are a sibling of the server's, not nested under
 * it, so client verbosity can be tuned independently.
 *
 * @param sub - Zero or more sub-category segments appended after `['anvika', 'client']`.
 * @returns A LogTape logger scoped to the client subtree.
 */
export function clientLogger(...sub: readonly string[]): ReturnType<typeof getLogger> {
  return getLogger(['anvika', 'client', ...sub]);
}
