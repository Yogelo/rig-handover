// Plan morning-digest § 1. Reads runs/<night>.jsonl into one DigestRow per job.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parse at the edge: a RunLine, or null when the text isn't one.
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;

  const { at, job, status, error } = o;
  const owner = o.owner === undefined ? null : o.owner;
  if (typeof at !== 'string') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return line;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readText(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const line = parseLine(trimmed);
    if (line === null) {
      badLines += 1;
      continue;
    }

    counts[line.status] += 1;
    const isRetry = line.status === 'retry' ? 1 : 0;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: isRetry,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
    } else {
      row.owner = line.owner;
      row.runs += 1;
      row.retries += isRetry;
      row.lastStatus = line.status;
      if (line.error !== undefined) row.lastError = line.error;
      row.lastAt = line.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, counts, badLines };
};
