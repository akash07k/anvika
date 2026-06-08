import { z } from 'zod';

/** Levels supported by the logger, lowest to highest severity. */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warning', 'error', 'fatal'] as const;

/** Zod schema for a valid log level string. */
export const LogLevelSchema = z.enum(LOG_LEVELS);

/** A valid log level string. */
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Valid config thresholds: every level plus `'off'`. `'off'` is a CONFIG value (a threshold
 * meaning "emit nothing at all"), never an event severity - event types stay `trace..fatal`.
 */
export const LOG_THRESHOLDS = [...LOG_LEVELS, 'off'] as const;

/** Zod schema for a valid log threshold (a level or `'off'`). */
export const LogThresholdSchema = z.enum(LOG_THRESHOLDS);

/** A valid log threshold: a {@link LogLevel} or the `'off'` switch. */
export type LogThreshold = z.infer<typeof LogThresholdSchema>;
