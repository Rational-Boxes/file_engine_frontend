---
id: files
title: Uploading & organizing files
category: Working with files
keywords: [files, upload, folder, browse, move, copy, rename, delete, undelete, trash, drag, drop, download, breadcrumbs, clipboard, thumbnail]
order: 1
related: [versions, editing, sharing, search, acl-inheritance]
---

The **Files** tab is where you browse, upload, and organize everything you have
access to. This page covers moving around, getting files in, and keeping them tidy.
For what happens to the *contents* of a file over time, see
[version history](#versions); for who can see each item, see
[sharing files & setting permissions](#sharing).

## Getting around

- **Folders** open on **double-click** (or click the folder's name). A single click
  on a *file* opens its **details drawer** on the right.
- **Breadcrumbs** across the top show where you are — click any crumb to jump back
  up the tree.
- **Sort** by clicking a column header — **Name**, **Size**, **Created**,
  **Created by**, **Modified**, or **Modified by**. Click again to reverse it.
  Folders always sort ahead of files.
- **↻ Reload** re-reads the current folder, picking up changes made by other people,
  by sync, or over [WebDAV](#webdav).

## Who created and changed a file

The list shows a full provenance trail for every item:

- **Created** / **Created by** — when the file was first added, and by whom.
- **Modified** / **Modified by** — when its **most recent version** was written, and
  who wrote it.

These aren't guesses or file-access times: the dates are derived from the file's own
[version history](#versions), so **Modified** always reflects the moment the latest
version was actually saved and advances each time someone adds a new one. A dash
(**—**) means the value isn't known. The same **Created** and **Modified** dates also
appear on the **Info** tab of a file's details drawer.

## Uploading

There are two ways to add files:

- **Upload** button — pick one or more files.
- **Drag and drop** — drag files anywhere onto the window and drop them on the
  **Drop files to upload here** overlay.

An **Uploads** tray appears at the bottom-right while transfers are in progress,
showing each file's progress and letting you **Clear finished** when done.

> **Uploading a file that already exists doesn't overwrite it.** If you upload a file
> whose name matches one already in the folder, FileEngine adds it as a **new
> version** of that file rather than replacing it or making a duplicate — nothing is
> ever lost. See [version history](#versions). (You upload individual files, not
> whole folders.)

## Organizing

- **New folder** creates a subfolder in the current location.
- **Rename** an item to change its name.
- **Move** a file by **Cut**ting it and then **Paste**ing it into the destination
  folder. **Copy** + **Paste** duplicates it instead. You can select several items
  with their checkboxes and act on them together from the selection bar
  (**{n} selected** → **Copy**, **Cut**, **Delete**, **Clear**).

Most of these actions also live on each row's **⋮** menu, and folder-changing actions
appear only where you have write access.

## Deleting is reversible

Deleting is a **soft delete** — the item is hidden, not destroyed. The confirmation
says as much: *"Deletes are soft — restore it with Undelete."* Toggle
**🗑 Show deleted** to reveal removed items, then **Undelete** to bring one back.

## The file details drawer

Single-click a file to open its drawer, which has four tabs:

- **Info** — type, size, owner, and dates, plus quick actions: **🔗 Copy link**
  (a deep link you can share), **💬 Comments**, **⬇ Download original**, and — for
  editable documents — **✎ Edit in browser** (see [editing in your browser](#editing)).
- **Metadata** — descriptive key/value fields attached to the file. These are
  [searchable](#search); editors can add or remove them.
- **Versions** — the file's full history (see [version history](#versions)).
- **Access** — who can see and change the file (see [sharing](#sharing)).
