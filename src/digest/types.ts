// Plan morning-digest § 1. The contract every part of § 2 starts against: the reader fills it,
// the page, the JSON and the board link only read it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after it parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; the view shows null as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // the latest `error` seen for this job, even if it ended `ok`
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON use this order as is
  counts: Record<RunStatus, number>; // lines per status, for the board link
  badLines: number; // lines that didn't parse; counted, never thrown
};

// null when runs/<night>.jsonl doesn't exist (or night isn't YYYY-MM-DD): the routes return 404.
// An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
