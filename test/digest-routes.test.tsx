import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixture runs dir: a temp dir, never runs/ (read-only).
let runsDir: string;

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

function app() {
  return createApp({ ...base, runsDir });
}

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.writeFileSync(
    path.join(runsDir, '2026-01-01.jsonl'),
    [
      '{"at":"2026-01-01T23:00:00+01:00","job":"b/job","status":"ok","owner":"lane-07"}',
      '{"at":"2026-01-01T23:01:00+01:00","job":"a/job","status":"retry","owner":null,"error":"boom"}',
      '{"at":"2026-01-01T23:02:00+01:00","job":"a/job","status":"ok","owner":null}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(runsDir, '2026-01-02.jsonl'), '');
  fs.writeFileSync(
    path.join(runsDir, '2026-01-03.jsonl'),
    '{"at":"2026-01-03T00:00:00+01:00","job":"c/job","status":"ok","owner":null}\n' +
      '{"at":"2026-01-03T01:00:00+01:00","job":"x/jo',
  );
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page (GET /digest/:night)', () => {
  it('renders both jobs, sorted by job, with owner null as an em dash', async () => {
    const res = await app().request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const a = html.indexOf('a/job');
    const b = html.indexOf('b/job');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    expect(html).toContain('—');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-12-31');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night file', async () => {
    const res = await app().request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    const res = await app().request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('c/job');
  });
});

describe('digest JSON (GET /api/digest/:night)', () => {
  it('returns the rows in page order with counts and lastError', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
    const a = body.rows[0];
    expect(a?.runs).toBe(2);
    expect(a?.retries).toBe(1);
    expect(a?.lastError).toBe('boom');
    expect(body.badLines).toBe(0);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-12-31');
    expect(res.status).toBe(404);
  });

  it('returns 200 with no rows for an empty night', async () => {
    const res = await app().request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line without failing the night', async () => {
    const res = await app().request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order for 2026-01-01', async () => {
    const html = await (await app().request('/digest/2026-01-01')).text();
    const body = (await (await app().request('/api/digest/2026-01-01')).json()) as Night;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });
});
