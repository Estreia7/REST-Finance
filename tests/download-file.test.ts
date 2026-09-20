import { describe, it, expect, vi } from 'vitest';
import {
  downloadFile,
  DownloadError,
  exportFilename,
  REVOKE_DELAY_MS,
  type DownloadDeps,
} from '@/lib/download-file';

/**
 * The bug these guard against: a plain link to an export endpoint navigates
 * away on iOS Safari and strands the owner on a document-preview screen with
 * no way back. The fix only holds if the page never navigates — so what is
 * asserted here is that the bytes are fetched, saved under a filename, and
 * that the object URL outlives the click rather than being revoked under it.
 */

/** A recording stand-in for the browser. */
function deps(
  fetchImpl: DownloadDeps['fetch'],
): DownloadDeps & {
  created: string[];
  revoked: string[];
  saved: Array<{ url: string; filename: string }>;
  timers: Array<{ fn: () => void; ms: number }>;
  runTimers: () => void;
} {
  const created: string[] = [];
  const revoked: string[] = [];
  const saved: Array<{ url: string; filename: string }> = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];

  return {
    created,
    revoked,
    saved,
    timers,
    runTimers: () => timers.forEach((t) => t.fn()),
    fetch: fetchImpl,
    createObjectURL: () => {
      const url = `blob:mock/${created.length}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url) => void revoked.push(url),
    saveAs: (url, filename) => void saved.push({ url, filename }),
    setTimeout: (fn, ms) => void timers.push({ fn, ms }),
  };
}

/** A fetch that answers with a CSV body. */
const okFetch = (body = 'a,b\n1,2\n') =>
  vi.fn(async () => new Response(body, { status: 200 })) as unknown as DownloadDeps['fetch'];

describe('downloadFile', () => {
  it('saves the fetched bytes under the given filename', async () => {
    const d = deps(okFetch());

    await downloadFile('/api/export/csv?type=revenue', 'receitas.csv', d);

    expect(d.created).toHaveLength(1);
    expect(d.saved).toEqual([{ url: d.created[0], filename: 'receitas.csv' }]);
  });

  it('sends cookies, since the export endpoint is authenticated', async () => {
    const fetchImpl = okFetch();
    const d = deps(fetchImpl);

    await downloadFile('/api/export/csv', 'x.csv', d);

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/export/csv',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('does not revoke the object URL before the browser has read it', async () => {
    const d = deps(okFetch());

    await downloadFile('/api/export/csv', 'x.csv', d);

    // Revoking straight after the click can cancel the download outright, so
    // nothing may be revoked until the delay has elapsed.
    expect(d.revoked).toHaveLength(0);
    expect(d.timers[0].ms).toBe(REVOKE_DELAY_MS);

    d.runTimers();
    expect(d.revoked).toEqual(d.created);
  });

  it('throws DownloadError carrying the status when the export is refused', async () => {
    const d = deps(vi.fn(async () => new Response('nope', { status: 403 })) as never);

    const err = await downloadFile('/api/export/csv', 'x.csv', d).catch((e) => e);
    expect(err).toBeInstanceOf(DownloadError);
    expect((err as DownloadError).status).toBe(403);
  });

  it('creates nothing and saves nothing for a failed export', async () => {
    const d = deps(vi.fn(async () => new Response('nope', { status: 500 })) as never);

    await expect(downloadFile('/api/export/csv', 'x.csv', d)).rejects.toThrow();
    expect(d.created).toHaveLength(0);
    expect(d.saved).toHaveLength(0);
    // Nothing was created, so nothing is scheduled for cleanup either.
    expect(d.timers).toHaveLength(0);
  });

  it('lets a network failure reach the caller', async () => {
    const d = deps(vi.fn(async () => { throw new TypeError('offline'); }) as never);

    await expect(downloadFile('/api/export/csv', 'x.csv', d)).rejects.toThrow('offline');
  });

  it('still schedules cleanup when saving itself throws', async () => {
    // A blob URL left alive forever is a leak; the cleanup is in a finally
    // for this case.
    const d = deps(okFetch());
    d.saveAs = () => { throw new Error('popup blocked'); };

    await expect(downloadFile('/api/export/csv', 'x.csv', d)).rejects.toThrow('popup blocked');
    expect(d.timers).toHaveLength(1);
    d.runTimers();
    expect(d.revoked).toEqual(d.created);
  });
});

describe('exportFilename', () => {
  it('dates the file so two exports in a month do not collide', () => {
    expect(exportFilename('receitas', '2026-09-01', '2026-09-30'))
      .toBe('receitas-2026-09-01-2026-09-30.csv');
  });

  it('falls back to a bare name when a range is missing', () => {
    expect(exportFilename('custos', '', '')).toBe('custos.csv');
  });
});
