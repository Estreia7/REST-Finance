/**
 * Saving a file from the browser, without losing the owner in the process.
 *
 * A plain `<a href>` pointing at an export endpoint looks like it works, and
 * on a desktop browser it does. On an iPhone it does not: Safari ignores the
 * `Content-Disposition: attachment` header, navigates away from the app and
 * hands the file to its document preview — a dead-end screen offering to open
 * the CSV in whatever app is installed, with no back button and no way to
 * actually keep the file. The owner has to close the tab and find their way
 * back into the dashboard.
 *
 * The fix is to never navigate. Fetch the bytes, wrap them in a blob URL, and
 * click a synthetic link carrying a `download` attribute, which Safari does
 * honour for same-origin blobs. The page stays exactly where it was.
 */

/** Raised when the export endpoint answers with something other than 200. */
export class DownloadError extends Error {
  constructor(readonly status: number) {
    super(`download failed with status ${status}`);
    this.name = 'DownloadError';
  }
}

/**
 * How long the blob URL is kept alive after the click.
 *
 * Revoking immediately can cancel the download before the browser has
 * finished reading the blob, which is the kind of failure that only shows up
 * on a slow phone.
 */
export const REVOKE_DELAY_MS = 10_000;

/**
 * The browser bits this needs, named so a test can stand in for them.
 *
 * The project's tests run in node with no DOM, and installing jsdom to cover
 * one function is a heavier change than the fix deserves. Passing these in
 * keeps the ordering — build the URL, set `download`, click, revoke late —
 * under test, which is the part that actually broke.
 */
export interface DownloadDeps {
  fetch: typeof fetch;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Performs the save. Separated so a test need not implement an anchor. */
  saveAs: (objectUrl: string, filename: string) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

/** The real browser, used whenever the caller does not supply its own. */
function browserDeps(): DownloadDeps {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    saveAs: (objectUrl, filename) => {
      const link = document.createElement('a');
      link.href = objectUrl;
      // The attribute Safari does honour for a same-origin blob, and the
      // reason the page stays put instead of navigating to a preview.
      link.download = filename;
      // Appended before clicking: a link outside the document does not
      // reliably trigger a download in every browser.
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
}

/**
 * Fetches `url` and saves the response as `filename`, without leaving the page.
 *
 * Deliberately does not offer the native share sheet. Sharing is right when the
 * file is meant for somebody else — the weekly rota going to the staff WhatsApp
 * group — but an export of the books is for the owner's own records, and a
 * share sheet there is one more screen between them and a saved file.
 *
 * Throws `DownloadError` on a bad response so the caller can tell a failed
 * export from a network problem and say something useful.
 */
export async function downloadFile(
  url: string,
  filename: string,
  deps: DownloadDeps = browserDeps(),
): Promise<void> {
  const res = await deps.fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new DownloadError(res.status);

  const blob = await res.blob();
  const objectUrl = deps.createObjectURL(blob);

  try {
    deps.saveAs(objectUrl, filename);
  } finally {
    deps.setTimeout(() => deps.revokeObjectURL(objectUrl), REVOKE_DELAY_MS);
  }
}

/**
 * The name an exported file is saved under.
 *
 * Dated, because an owner who exports the same report twice in a month should
 * not end up with "revenue-export (1).csv" and no idea which is which.
 */
export function exportFilename(kind: string, from: string, to: string): string {
  const span = from && to ? `-${from}-${to}` : '';
  return `${kind}${span}.csv`;
}
