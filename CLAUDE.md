# Project Overview

This project is a a app for the finance of restaurant owner's to have control in their numbers and to have the possibility analyse and imporve their revenue and profit also margins.

# Tech Stack

- Framework: Next.js 14 (App Router)
- Language: TypeScript
- Database: PostgreSQL hosted on Supabase
- ORM: Prisma (connects to Supabase DB via connection string)
- Styling: Tailwind CSS
- Auth: Supabase Auth
- Deployment: Railway (via GitHub auto-deploy)

# Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

# Code Rules

- Always use functional components, never class components
- Use TypeScript types/interfaces, avoid `any`
- All DB queries go through Prisma ORM only
- Use server components by default, client components only when needed
- Follow existing file/folder naming conventions

# Folder Structure

- /app → Next.js pages and layouts
- /components → Reusable UI components
- /lib → Utilities and helpers
- /prisma → Schema and migrations

# Infrastructure

- Supabase → Everything data: PostgreSQL DB, Auth, Storage, Realtime
- Railway → Only hosts the Next.js app, connected to GitHub
- GitHub → Push to main triggers auto-deploy on Railway

# Deployment Notes

- Railway connected to GitHub repo (auto-deploy on push to main)
- Environment variables set in Railway dashboard (not .env.local in prod)
- Run `prisma migrate deploy` on Railway at deploy time (never `migrate dev`)
- Prisma connects to Supabase DB via DATABASE_URL (use Supabase pooled connection string)

# Environment Variables

- Local dev: .env.local (never commit)
- Production: set directly in Railway dashboard
- NEXT_PUBLIC_SUPABASE_URL → Supabase project URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY → Supabase anon key
- DATABASE_URL → Supabase pooled connection string (for Prisma)
- DIRECT_URL → Supabase direct connection string (for Prisma migrations)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Documentation & Libraries

### 7. Always Use Context7
- When working with any library, framework, or API: use Context7 MCP to fetch current documentation automatically — don't rely on training data.
- This applies to: setup questions, code generation, API references, configuration steps, and anything involving specific packages.
- Steps: call `resolve-library-id` → pick the best match → call `query-docs` → answer using the fetched docs with code examples.
- Do this proactively — the user should never have to ask for it.

## Both languages, always — no new hardcoded strings

The app ships in Portuguese and English — **all of it**: the dashboard, the
admin console, the public pages, the sign-in and password flows. Every string a
user can read goes through the dictionary, in both languages, in the same commit
as the feature.

This is not a translation pass to do later. Doing it later is how the dashboard
ended up with ~200 Portuguese strings baked into the JSX, and how the admin
console stayed Portuguese-only for months after the dictionary was complete.
"It is only internal" is not an exemption: internal screens get demonstrated.

**The rule**

1. No user-facing text written directly in JSX. Use `t('some.key')` from
   `useLanguage()`.
2. Every new key gets **both** a `pt` and an `en` value in `lib/translations.ts`,
   added together. `tests/translations-parity.test.ts` fails the build if one
   side is missing, empty, or the English value still carries Portuguese
   accents.
   `tests/no-hardcoded-strings.test.ts` catches the other half: Portuguese
   written straight into the markup, which a balanced dictionary says nothing
   about. If it flags a file, move the text into the dictionary — do not add
   the file to its exemption list unless the Portuguese genuinely belongs in
   the source (legal text, tax terms, the dictionary itself), and say why.
3. This includes the things that are easy to forget: `toast.success` /
   `toast.error` messages, `aria-label`s, `placeholder`s, button labels, empty
   states, confirm dialogs, and date or number formatting that differs by
   locale.
4. Server actions and route handlers cannot call `t()` — they have no React
   context. They return a **key**, not a sentence, and the component translates
   it. Never return a Portuguese sentence straight to a toast.
5. The landing page is Portuguese by default and anyone may switch. From login
   onwards the account's saved language wins, resolved on the server in
   `lib/server-language.ts` so the first paint is never the wrong language.

**Where language lives**: on the `User` row, with a cookie for signed-out
visitors. Never in `localStorage` — it has to follow the owner to another
device.

Before finishing any UI work, run `npx vitest run tests/translations-parity.test.ts`
and switch the language in the app to look at what you built.

## The walkthrough — keep it current, keep it short

New clients are shown a guided tour on first login (`lib/tour.ts`,
`app/dashboard/components/Walkthrough.tsx`). It points at real controls via
`data-tour` attributes.

**When you add a feature, decide — and say which:**

- **A place an owner must find to use the app** (a new main tab, a new daily
  habit) → add a step. Put a `data-tour="..."` on the anchor element and a step
  in `TOUR_STEPS`, with `pt` and `en` copy.
- **Anything else** (a refinement, a setting, a second-order screen) → no step.
  The changelog already tells existing owners about it.

**Rules for steps**

1. **Keep it under ~8 steps.** This runs when patience is lowest. If a step
   earns its place, consider whether an older one has stopped earning its own.
2. One idea per step, two short sentences at most. Say what the owner does
   there, not what the screen contains.
3. Anchor by `data-tour`, never by CSS class or DOM position. A step whose
   anchor is missing is skipped automatically, so a feature that is not on
   every plan or screen size degrades quietly.
4. Set `tab` so the tour navigates there itself.
5. Bump `TOUR_VERSION` when steps change meaningfully.
6. Never make the tour required reading: **Skip must always work**, and
   skipping counts as seen.

Check it by running the demo account's "Replay the tour" button, which is the
only way back in once seen.

## The presentation — keep it true

`app/admin/components/PresentationPanel.tsx` is what the app is sold with. When
a change alters **what we can tell a restaurant owner we do** — a new capability,
a materially better one, or one that has gone away — update the presentation in
the same commit, in both languages.

Refinements and fixes do not belong there; it is a sales deck, not a changelog.
Never add a number, a claim or a customer we cannot stand behind.

## Changelog — required for every user-facing change

Every change a restaurant owner would notice gets an entry in
`lib/changelog.ts`, in the same commit as the change itself. A changelog
written later is written from the git log, and a git log entry is about the
code, not about what the owner can now do.

**Steps**
1. Add the entry to the newest release in `lib/changelog.ts`, under one of the
   three kinds:
   - `new` — something they could not do before
   - `improvement` — something they could do, now better
   - `fix` — something that was wrong and no longer is
2. Bump `CHANGELOG_VERSION` and the release `date` when starting a new release.
3. Write it for the owner, not for us. "The menu calculator now takes prices
   from your invoices" — never "refactored the costing module". No file names,
   no component names, no internal vocabulary.
4. Say where to find it when the feature lives somewhere non-obvious
   ("Em Análises › Ementa").

**Skip it** for pure refactors, test-only changes, dependency bumps, and
anything else with no visible effect. If you cannot describe the change in
terms of what the owner can now do, it probably does not belong in the
changelog.

The entries surface in the dashboard top bar under the sparkles icon, with an
unread dot until the owner opens it.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
