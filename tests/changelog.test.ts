import { describe, it, expect } from 'vitest';
import {
  CHANGELOG, CHANGELOG_VERSION, groupByKind, hasUnread, KIND_LABEL, KIND_LABEL_EN,
} from '@/lib/changelog';

describe('changelog data', () => {
  it('has at least one release', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it('starts at the version the unread dot compares against', () => {
    // If these drift apart, every reader sees a permanent unread dot.
    expect(CHANGELOG[0].version).toBe(CHANGELOG_VERSION);
  });

  it('is ordered newest first', () => {
    const dates = CHANGELOG.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('uses ISO dates that parse', () => {
    for (const release of CHANGELOG) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(release.date).getTime())).toBe(false);
    }
  });

  it('gives every entry a title and a valid kind', () => {
    for (const release of CHANGELOG) {
      expect(release.entries.length).toBeGreaterThan(0);
      for (const entry of release.entries) {
        expect(entry.title.trim().length).toBeGreaterThan(0);
        expect(['new', 'improvement', 'fix']).toContain(entry.kind);
      }
    }
  });

  it('avoids developer vocabulary in what the owner reads', () => {
    // The rule this file exists to enforce: a release note, not a commit log.
    const jargon = /\b(refactor|component|module|hook|endpoint|schema|migration|typescript|prisma)\b/i;
    for (const release of CHANGELOG) {
      for (const entry of release.entries) {
        expect(jargon.test(entry.title), entry.title).toBe(false);
        if (entry.detail) expect(jargon.test(entry.detail), entry.detail).toBe(false);
      }
    }
  });
});

describe('groupByKind', () => {
  it('orders new before improvements before fixes', () => {
    const groups = groupByKind([
      { kind: 'fix', title: 'c' },
      { kind: 'improvement', title: 'b' },
      { kind: 'new', title: 'a' },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['new', 'improvement', 'fix']);
  });

  it('drops empty groups rather than rendering a bare heading', () => {
    const groups = groupByKind([{ kind: 'new', title: 'a' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('new');
  });

  it('handles an empty release without throwing', () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe('hasUnread', () => {
  it('is unread for a first-time reader', () => {
    expect(hasUnread(null)).toBe(true);
  });

  it('is read once the current version was seen', () => {
    expect(hasUnread(CHANGELOG_VERSION)).toBe(false);
  });

  it('is unread again after a version bump', () => {
    expect(hasUnread('2000.01.01')).toBe(true);
  });
});

describe('labels', () => {
  it('names all three kinds in both languages', () => {
    for (const kind of ['new', 'improvement', 'fix'] as const) {
      expect(KIND_LABEL[kind]).toBeTruthy();
      expect(KIND_LABEL_EN[kind]).toBeTruthy();
    }
  });
});
