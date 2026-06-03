import type { UserConfig } from '@commitlint/types';

/**
 * Commitlint configuration: enforce Conventional Commits via the conventional preset.
 * Loaded by the Lefthook `commit-msg` hook (`bunx commitlint --edit`).
 */
const configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
};

export default configuration;
