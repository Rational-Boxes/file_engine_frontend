---
id: editing
title: Editing documents in your browser
category: Working with files
keywords: [edit, editor, onlyoffice, office, word, excel, spreadsheet, powerpoint, docx, xlsx, pptx, html, wysiwyg, document, save]
order: 4
related: [files, versions, ai-research]
---

You can edit many documents **directly in the browser** — no need to download,
open a desktop app, and re-upload. Edits save straight back into FileEngine as a new
version.

## Opening the editor

Open a file's details drawer and click **✎ Edit in browser** (or **✎ Edit** from a
file preview). The document opens in a full-page editor; use **← Back** to return to
where you were.

The button appears for document types the editor understands, including:

- **Documents** — Word files (`.docx` and friends), OpenDocument text (`.odt`), rich
  text, and plain text.
- **Spreadsheets** — Excel files (`.xlsx`), OpenDocument spreadsheets (`.ods`), and
  CSV.
- **Presentations** — PowerPoint (`.pptx`) and OpenDocument presentations (`.odp`).
- **Web pages** — `.html` / `.htm`, edited **visually** (see below).

## Saving = a new version

You don't manage files by hand while editing. The editor shows its state — **Editing…**
while you have unsaved changes, **Saved** once they're stored — and **each save writes
a new version** of the file rather than overwriting it. Your earlier versions stay
intact and are available any time from the **Versions** tab (see
[version history](#versions)).

## Editing HTML visually

Because `.html` files open in the document editor, you can edit stored web pages
**WYSIWYG** — formatting them like a normal document instead of hand-writing markup.
This is especially handy for tidying up an [AI-generated report](#ai-research), which
is saved as HTML: open it, edit it visually, and each save keeps a version.

## When editing isn't available

- **You need write access.** If you can open a document but not change it, the editor
  reports *"You do not have permission to edit this document."* — that's the file's
  [permissions](#acl-basics) at work.
- **The feature can be turned off per deployment.** If in-browser editing isn't
  enabled where you are, you'll see *"In-browser editing is not enabled on this
  deployment."* You can still download the file and edit it locally.
