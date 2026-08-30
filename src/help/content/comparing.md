---
id: comparing
title: Comparing two versions of a file
category: Working with files
keywords: [compare, comparison, difference, diff, changed, revision, version, before, after, drawing, markup, redline, what changed, side by side, 3d compare, model compare]
order: 6
related: [versions, pdf-markup, cad-bim, files]
---

Version history tells you *that* a file changed. This tells you **what** changed
— page by page for documents and drawings, and object by object for 3D models.

## Starting a comparison

Open a file's details drawer, choose the **Versions** tab, tick **two** versions
and press **Compare selected**.

Once a comparison is open you can change the pair from the picker in its header,
without going back to the version list.

## The three views

A comparison opens with three buttons:

- **Before** — the older version on its own.
- **After** — the newer version on its own.
- **Difference** — only what changed, drawn over the page.

Switching between them is instant. Nothing is re-fetched, so flicking
back and forth is the fastest way to confirm whether something really moved or
just looks different.

Pages have their own navigation, and the view zooms and pans — useful on a large
drawing where the change is a single dimension in a corner.

## How a page was compared

Each page carries a short **label** of how it was compared — hover it for the
fuller explanation — because it changes how much to trust the result:

- **vector** — *compared object by object*: text and shapes were matched
  individually. This is the precise case: a moved line is reported as moved, not as
  one deletion and one addition.
- **scanned** — *compared as an image*: the page is a scan or has no extractable
  content, so changed *regions* are highlighted rather than individual objects. Good
  enough to see where to look, not precise enough to say exactly what altered.
- **hybrid** — *text compared, graphics as an image*: a mixture of the two, common
  in drawings with a CAD background and typed annotations.
- **unavailable** — no comparison could be produced for the page.

That label is worth reading before drawing conclusions. On a **scanned** page a
slight rescan shift can light up a whole region that contains no real change.

## 3D models

Two versions of a model compare in the 3D viewer rather than page by page:
objects that were added, removed or moved are called out in the model itself, so
you can orbit to a change instead of hunting for it.

See [viewing CAD & BIM models](#cad-bim) for the viewer's own controls.

## Things worth knowing

**Comparisons are prepared in the background.** A new version is usually compared
before anyone asks, so the common case opens immediately. A pair nobody has
looked at yet may take a moment the first time.

**Order matters for the wording, not the result.** The older version is the
"before" — pick the pair the other way round and additions read as deletions.

**A comparison is not a merge.** It shows you what differs; it does not combine
the two. If you want the older content back, restore that version from
[version history](#versions).

**Nothing you do here changes the file.** Comparing, zooming and flipping views
are all read-only. To mark up what you found, use
[PDF markup](#pdf-markup) or leave a [comment](#comments).
