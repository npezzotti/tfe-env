import ms, { type StringValue } from 'ms';

export type DurationOpt = 'since' | 'until'

export function parseDuration(opt: DurationOpt, raw: string, now: number): number {
  const value = raw.trim();

  if (/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`${opt} needs a unit, e.g. "30s", "10m" or "2h" (got "${raw}").`);
  }

  const duration = value === '' ? undefined : ms(value as StringValue);

  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    throw new Error(`Invalid ${opt} value "${raw}". Use a duration like "30s", "10m", "2h" or "1d".`);
  }
  if (duration < 0) {
    throw new Error(`${opt} must be a positive duration (got "${raw}").`);
  }

  return now - duration;
}