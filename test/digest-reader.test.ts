import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads 5 jobs sorted by job, with 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps a job whose owner is null', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('summarises a job that retried and then passed', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts runs and retries per job', () => {
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });
});

describe('readNight edges', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [
        '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"retry","error":"x"}',
        '   ',
        '{"at":"2026-01-02T01:01:00+01:00","job":"a","status":"ok","owner":"lane-07"}',
        '{"at":"2026-01-02T01:02:00+01:00","job":"","status":"ok","owner":null}',
        '{"at":"2026-01-02T01:03:00+01:00","job":"b","status":"done","owner":null}',
        '[1,2]',
        'not json',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-03')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
    expect(readNight(dir, '')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('skips blank lines, counts invalid ones, treats missing owner as null', () => {
    const night = readNight(dir, '2026-01-02');
    expect(night?.badLines).toBe(4);
    expect(night?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'lane-07',
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'x',
        firstAt: '2026-01-02T01:00:00+01:00',
        lastAt: '2026-01-02T01:01:00+01:00',
      },
    ]);
  });
});
