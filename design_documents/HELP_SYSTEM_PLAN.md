# Design: In-App Help & Documentation System

**Status:** Draft
**Branch:** `feature/help-documentation`
**Author:** (drafted with Claude Code)
**Date:** 2026-07-05

---

## 1. Motivation

The application has grown several subsystems that are powerful but non-obvious to
end users. Permissions in particular are subtle — new items inherit **only** the
parent ACL rules explicitly flagged for inheritance, as a one-time copy at creation
time, not a live link (see the core `ACL_INHERIT` behaviour). Users currently have
no in-app explanation of this; the only guidance is a one-line `acl-note` in
`AclEditor.vue`.

We need an end-user documentation layer that:

1. Provides a **global entry point** to browse all help topics.
2. Surfaces **contextual help** next to complex features via a consistent help
   icon, so a user reading the ACL editor can open the ACL tutorial in place.
3. Ships a **tutorial on how the ACL system works** as the first flagship topic.
4. Establishes a **repeatable pattern** so future features add help with minimal
   effort.

Crucially, help must be **non-disruptive**: opening it must not navigate away from
or unmount whatever the user is doing, and it must **remember the user's place** in
the documentation so they can close it, act on what they read, and reopen exactly
where they left off. This drives the central design decision below — help is a
single persistent **modal overlay**, not a route or a page-level view.

This document covers the architecture and the initial content set. It does not
cover writing the full prose of every article (tracked separately per topic).

---

## 2. Goals & Non-Goals

### Goals
- A single **global help modal overlay** reachable from the top nav that opens
  over the current view **without changing or unmounting it**.
- **Persistent reading position:** the overlay remembers the active topic, scroll
  position, navigation history, and search state across close/reopen (and across
  page reloads), so the user never loses their place.
- Reusable `<HelpIcon topic="...">` component placed beside complex features that
  opens the same overlay directly to the relevant article.
- Markdown-authored content, versioned in-repo, rendered with the existing
  `marked` + DOMPurify pipeline.
- Search across topics.
- Accessible (keyboard, ARIA) and theme-aware (dark/light) by construction.

### Non-Goals (this phase)
- Internationalization. The app is English-only today; content is authored in
  English. We isolate content so i18n can be layered on later (see §9).
- Interactive product tours / spotlight onboarding. Deferred; the architecture
  leaves room (see §10).
- A CMS or runtime-editable content. Content ships with the frontend build.
- Server-side help content. Everything is static and bundled.

---

## 3. Fit With Existing Architecture

The design deliberately reuses established patterns rather than introducing new
dependencies:

| Concern | Existing pattern reused |
|---|---|
| Rendering markdown | `utils/markdown.ts` (`renderMarkdown`) — `marked` + DOMPurify |
| Untrusted-safe HTML | Not needed — our content is trusted/in-repo, so plain scoped render is fine (no Shadow DOM required, unlike LLM output) |
| Overlays | `Teleport to="body"` + fixed positioning, as in `KebabMenu.vue` / `ThreadOverlay.vue` |
| Global state | Pinia store (`useHelpStore`), mirroring `comments.ts` open/close pattern |
| Overlay mounting | Single instance teleported at `App.vue` root, like the existing overlay portals (`ThreadOverlay`, `ModelViewerOverlay`) — lives outside any router view |
| Icons | Emoji/text glyph (`ⓘ` / `?`) consistent with the no-icon-library convention |
| Styling | Scoped CSS + `:root` custom properties (`--fg`, `--primary`, `--border`) |

**No router changes.** Help is intentionally *not* a route: routing would swap the
active view and destroy the user's working context, which is exactly what the
overlay approach avoids. The overlay is a sibling of `<router-view>`, not a route
under it, so the current view stays mounted and untouched underneath. (Optional
deep-linking via a URL query param is discussed in §13 as a non-breaking add-on.)

No new runtime dependencies are required. `marked` and `dompurify` are already
present.

---

## 4. User-Facing Surfaces

There is exactly **one** help surface: a single persistent modal overlay
(`HelpModal.vue`). Every entry point — the global link and every contextual help
icon — opens that same instance. This is what makes "remember my place" simple: a
single component with a single backing store, rather than several disconnected
surfaces each with their own state.

### 4.1 The help modal overlay (`HelpModal.vue`)
A single instance mounted once at the `App.vue` root and teleported to `<body>`,
sitting alongside `<router-view>` rather than inside it. When open it renders as a
centered modal (with a dimming backdrop) over the current view; the view underneath
stays fully mounted and returns unchanged when the modal closes.

Layout inside the modal:
- A **topic index** grouped by category (Getting Started, Permissions,
  Collaboration, 3D & CAD/BIM, AI Research, Admin).
- A **search box** filtering topics by title/keywords.
- A **content pane** rendering the selected article's markdown, with in-article
  links and a "See also" list.
- A **back/forward** control reflecting the in-modal navigation history.

Because it is not a route, opening/closing the modal never touches
`<router-view>`, browser history, or the active view's component state.

### 4.2 Global help link
A persistent entry point in `AppNav.vue` (top bar), rendered as a `?` / "Help"
button. It **toggles the modal open** (`helpStore.open()`) — it is a `<button>`,
not a `<router-link>`. Opening returns the user to wherever they last were in the
docs (see §6 persistence); first-ever open lands on the index / Getting Started.

### 4.3 Contextual help icon
A small reusable `<HelpIcon topic="acl-basics" />` placed inline next to feature
headers/controls. Behaviour:
- Renders an unobtrusive `ⓘ` button with an `aria-label` and native `title`.
- On click, calls `helpStore.openTopic('acl-basics')`. This is **semantically a
  navigation**, identical to clicking an in-modal link — it routes through the same
  `pushTopic()` path, so the topic is appended to the existing history stack. The
  only difference from an in-modal link is that it can also open the modal if it was
  closed. It is *not* a special "reset and show topic" action.
- Consequently **Back works immediately from a topic-icon jump**: it returns to the
  article the user was previously reading — even if help had been closed in between
  (the stack persists across close/reopen). If there is no prior entry yet (the
  very first thing the user ever opens is a topic icon), Back is simply disabled.
- Keyboard accessible; `Esc` closes; focus is trapped while open and restored to
  the triggering icon on close.

The two entry points differ only in *where* the modal opens; they share one
component, one store, and one persisted reading position. Opening a specific topic
via a help icon still preserves the prior history, so the user can page back to
what they were reading before.

### 4.4 Navigation memory (back / forward)

The modal maintains its **own** browsing history, entirely separate from the app's
router/browser history. This is what makes context-icon jumps non-destructive: a
user reading `acl-basics`, who then closes help, works in a CAD view, and clicks
the CAD help icon, can press **Back** and land right back on `acl-basics`. The
history is a linear stack with a cursor (`history` + `historyIndex`), behaving like
a browser's own back/forward:

**What pushes a new history entry** (each truncates any forward entries, like a
browser navigating after going back):
- Clicking a topic in the index.
- Clicking an in-article link or a "See also" entry.
- Opening a topic via a contextual `<HelpIcon>` — pushed onto the *existing* stack,
  so the prior trail is preserved (not cleared).
- Selecting a search result.

**What does NOT push an entry:**
- **Back** / **Forward** — these move `historyIndex` along the existing stack
  without mutating it (re-pushing on back would make forward impossible).
- Opening the modal via the global `?` link — this restores the last position and
  its full stack rather than starting fresh.
- Scrolling within an article (scroll offset is remembered per topic separately, so
  Back returns you to both the right article *and* where you were scrolled in it).

**Edge cases spelled out:**
- Re-navigating to the topic already at the cursor is a no-op (no duplicate
  adjacent entries), matching browser behaviour.
- Back/Forward controls are disabled at the ends of the stack (`historyIndex === 0`
  / last index).
- The stack is bounded (e.g. cap at ~50 entries, dropping the oldest) so it can't
  grow without limit.
- The entire stack and cursor are part of the persisted `nav` state (§6), so
  back/forward memory survives close/reopen and page reloads — not just the single
  active topic.

The **back/forward control** in the modal header (§4.1) is a direct view of
`historyIndex` within `history`; there is no separate UI state to keep in sync.

---

## 5. Content Model

Each help topic is a markdown file plus lightweight metadata. Content lives in the
repo under `src/help/content/` and is imported at build time (Vite glob import),
so there is no network fetch and topics are tree-shakeable.

```
src/help/
  content/
    acl-basics.md
    acl-inheritance.md
    comments.md
    cad-bim.md
    ai-research.md
    ...
  index.ts          # registry: id -> { meta, loader }
```

### Topic metadata
Authored as YAML frontmatter in each `.md` (parsed at build), or as a sibling
registry entry. Fields:

```ts
interface HelpTopic {
  id: string            // 'acl-basics' — used by <HelpIcon topic> and the modal
  title: string         // 'How permissions (ACLs) work'
  category: HelpCategory
  keywords: string[]    // for search
  order?: number        // sort within category
  related?: string[]    // ids of related topics -> "See also"
}
```

The registry (`src/help/index.ts`) is the single source of truth mapping `id →
{ meta, contentLoader }`. `<HelpIcon>` and `HelpModal` both resolve topics through
it, so an invalid `topic` id is a build/lint-catchable error rather than a broken
link.

### Rendering
Content passes through `renderMarkdown()`. Because content is first-party and
in-repo (not untrusted LLM output), we render into a normal scoped container — the
Shadow DOM isolation used for chat responses is unnecessary here. We still run
DOMPurify (defense in depth, and it's already in the pipeline).

---

## 6. State & Persistence: `useHelpStore` (Pinia)

The store is the single source of truth for both *whether* the modal is open and
*where the reader is*. Separating "open" from "reading position" is what lets us
close the modal without losing the user's place: closing only flips `open`, leaving
the navigation state intact for the next open.

```ts
interface HelpNavState {
  history: string[]              // in-modal back/forward stack of topic ids
  historyIndex: number           // cursor within history; -1 when empty
  scrollTops: Record<string, number>  // per-topic scroll position
  search: string                 // last search query
}

const MAX_HISTORY = 50

export const useHelpStore = defineStore('help', {
  state: () => ({
    open: false,
    nav: loadPersistedNav(),       // hydrated from localStorage on init
    dismissedHints: [] as string[],
  }),
  getters: {
    // The article at the cursor — the single source of truth for what's shown
    activeTopicId: (s) => s.nav.history[s.nav.historyIndex] ?? null,
    canBack:    (s) => s.nav.historyIndex > 0,
    canForward: (s) => s.nav.historyIndex < s.nav.history.length - 1,
  },
  actions: {
    // Global link: reopen wherever the user left off (keeps the whole stack)
    openAtLastPosition() { this.open = true },

    // Contextual icon: navigate to a specific article, preserving prior trail
    openTopic(id: string) { this.pushTopic(id); this.open = true },

    // New navigation: no-op if already at this topic; otherwise drop any
    // forward entries, append, advance the cursor, and cap the stack length.
    pushTopic(id: string) {
      const n = this.nav
      if (n.history[n.historyIndex] === id) return          // same topic -> no dup
      n.history = n.history.slice(0, n.historyIndex + 1)     // truncate forward
      n.history.push(id)
      if (n.history.length > MAX_HISTORY) n.history.shift()  // bound the stack
      n.historyIndex = n.history.length - 1
    },

    // Move the cursor only — never mutate the stack (preserves forward)
    back()    { if (this.canBack)    this.nav.historyIndex-- },
    forward() { if (this.canForward) this.nav.historyIndex++ },

    // Close is deliberately non-destructive — nav state survives for reopen
    close() { this.open = false },

    rememberScroll(id: string, top: number) { this.nav.scrollTops[id] = top },
    dismissHint(id: string) { /* push + persist */ },
  },
})
```

Deriving `activeTopicId` from `history[historyIndex]` (rather than storing it
separately) removes the risk of the shown article and the history cursor drifting
out of sync — Back/Forward simply move the cursor and the content pane follows.

### Persistence mechanism
The `nav` slice (active topic, history, scroll positions, search) and
`dismissedHints` are **persisted to `localStorage`** — the same approach used for
theme preference — via a store subscription (`$subscribe`) or a small persistence
plugin. Consequences:

- **Close/reopen within a session:** state is in memory; reopen is instant and
  exact. The modal is never unmounted (only `v-show`/conditionally rendered), so
  even scroll position of the DOM can be preserved directly.
- **Across page reloads:** `loadPersistedNav()` rehydrates the last position from
  `localStorage`, so a reload followed by opening help still lands the reader where
  they were.
- **Scope:** persisted per browser/profile. (If it should be per-user, key the
  `localStorage` entry by the authenticated user id from the `auth` store — see
  §13.)

`dismissedHints` reserves room for future "new feature" nudges without a schema
change (see §10).

---

## 7. Components

| Component | Location | Role |
|---|---|---|
| `HelpModal.vue` | `components/` | The single overlay: backdrop, index, search, content pane, back/forward. Mounted once in `App.vue`, teleported to `<body>`, driven by `useHelpStore` |
| `HelpIcon.vue` | `components/` | Inline `ⓘ` trigger; `topic` prop; calls `helpStore.openTopic()` |
| `HelpArticle.vue` | `components/` | Renders a topic's markdown + "See also" links; used as the modal's content pane |
| `HelpSearch.vue` | `components/` | Search box + result list (used inside `HelpModal`) |

There is no `HelpView` route component and no separate popover — the single
`HelpModal` is the only surface, which is what keeps the reading position
authoritative and unified. `HelpModal` is instantiated exactly once so its state
and DOM (including scroll) survive open/close.

---

## 8. Initial Content Set

Ordered by priority. The **ACL tutorial is the flagship deliverable** and should
be accurate to core behaviour.

1. **`acl-basics` — How permissions (ACLs) work** *(flagship)*
   - What an ACL rule is: principal (user / role / claim / everyone), permission
     bits, allow vs deny.
   - Evaluation order (matches the `AclEditor` note): User rules → Roles & Claims
     → Everyone; DENY wins within a group; unset = read-by-default.
   - The permission set (READ, WRITE, DELETE, MANAGE_ACL, versioning perms,
     CULL_VERSIONS, etc.) in plain language.
   - Anchored by `<HelpIcon topic="acl-basics">` in `AclEditor.vue`.

2. **`acl-inheritance` — How new items inherit permissions**
   - The key correction to a common misconception: a new item does **not** copy
     the whole parent ACL. It inherits **only** rules flagged `ACL_INHERIT`.
   - Inheritance is a **one-time copy at creation**, not a live link — later
     changes to the parent do not propagate to existing children.
   - The inherit flag **cascades**: an inherited rule keeps its inherit bit, so it
     propagates to grandchildren.
   - The creator always receives full control regardless of parent.
   - Worked example (folder with one inheritable + one non-inheritable rule →
     what a new child ends up with).

3. **`comments` — Discussions & comments**
   - Threaded comments, replies, mentions, edit/delete; where threads attach.

4. **`cad-bim` — Viewing CAD & BIM models**
   - Supported formats (IFC, glTF, STEP/IGES, point clouds, meshes, CityJSON),
     the 3D viewer controls, model tree, navigation.

5. **`ai-research` — The AI research chat**
   - What the assistant can do, document + web citations, conversations, and
     appropriate-use / trust guidance for generated answers.

6. **`getting-started` — Orientation** *(top of the index)*
   - The file browser, uploads, search, and where the other topics live.

Each complex feature listed above gets a `<HelpIcon>` beside its primary UI:

| Feature | Anchor component | Topic |
|---|---|---|
| ACL editor | `AclEditor.vue` | `acl-basics` (+ link to `acl-inheritance`) |
| Comments | `ThreadPanel.vue` | `comments` |
| 3D/CAD viewer | `ModelViewerOverlay.vue` | `cad-bim` |
| AI chat | `ChatView.vue` | `ai-research` |

---

## 9. Content Authoring & i18n readiness

- Content is plain markdown, reviewable in PRs like code.
- Topic text is **not** inlined into `.vue` templates — it lives in `content/*.md`.
  This isolation is the single most important thing for a future i18n pass: adding
  locales becomes "add `content/<locale>/*.md`" plus a locale switch in the
  loader, with no component changes.
- Keep screenshots out of the flagship articles initially (they rot fast); prefer
  described steps and worked examples. Revisit once UI stabilizes.

---

## 10. Extensibility (future, out of scope now)

- **New-feature hints:** `dismissedHints` in the store already anticipates a small
  "what's new" nudge that points at a help topic and remembers dismissal.
- **Guided tours:** a tour could be a sequence of `{ selector, topicId }` steps
  reusing `HelpArticle` for each step's body.
- **Deep links from errors:** a permission-denied error could call
  `helpStore.openTopic('acl-basics')` to pop the ACL article over the current view
  for self-service resolution — again without navigating away.

---

## 11. Accessibility & Theming

- Help icon is a real `<button>` with `aria-label`; the modal uses
  `role="dialog"` + `aria-modal="true"`, a focus trap, `Esc` to close, and focus
  restore to the element that opened it.
- Because the underlying view stays mounted, take care that it is inert to
  interaction while the modal is open (backdrop + `aria-hidden`/`inert` on the app
  root) so keyboard focus can't escape behind the modal.
- All colors from existing `:root` custom properties so dark/light Just Works.
- Rendered markdown gets a scoped `.help-content` wrapper with typographic styles
  (headings, code, lists) matching app conventions.

---

## 12. Rollout Plan

1. **Scaffolding:** `useHelpStore` (with the persistence plugin/subscription),
   registry (`src/help/index.ts`), Vite glob content loader.
2. **Core components:** `HelpModal` mounted in `App.vue` (teleported, single
   instance), `HelpArticle`, `HelpIcon`, and the global `?` button in `AppNav.vue`.
   Verify open/close preserves the underlying view and the reading position.
3. **Flagship content:** write and review `acl-basics` and `acl-inheritance`;
   wire `<HelpIcon>` into `AclEditor.vue`. Verify against core ACL behaviour.
4. **Remaining anchors + content:** comments, CAD/BIM, AI research; add their
   help icons.
5. **Search + polish:** `HelpSearch`, back/forward + scroll persistence, keyboard
   nav, accessibility pass (focus trap, inert background).

Each step is independently shippable behind the always-visible Help link.

---

## 13. Open Questions

- **Frontmatter vs. registry file** for topic metadata — frontmatter keeps
  metadata next to content; a central registry is easier to lint. Leaning
  frontmatter parsed at build into the registry (best of both). *Needs decision.*
- **Modal presentation** — centered dialog vs. large side panel for the overlay.
  Both satisfy "overlay without changing the view"; centered dialog reads more as
  "reference material," a side panel lets the user see more of the app alongside.
  Leaning **centered dialog** (resizable/large). *Needs UX decision.*
- **Optional deep-linking** — should we mirror the open article into a URL query
  param (e.g. `?help=acl-basics`) so help state is shareable/bookmarkable? This can
  be added without making help a route: write the param on open, read it on load,
  and it never swaps `<router-view>`. Adds shareability at the cost of touching the
  URL. *Needs decision — default to not doing it in phase 1.*
- **Persistence scope** — persist reading position per browser (simple) or per
  authenticated user (key the `localStorage` entry by `auth` user id)? Per-user is
  friendlier on shared machines. *Needs decision.*
- Should ACL content also live in the **backend/core repo** as the canonical
  source and be synced, given it documents core semantics? Or is a frontend-owned
  copy acceptable, accepting drift risk? *Needs decision.*
