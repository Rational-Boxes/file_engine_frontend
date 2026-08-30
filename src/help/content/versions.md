---
id: versions
title: Version history
category: Working with files
keywords: [version, history, restore, rollback, revert, previous, purge, keep, immutable, cull, undo]
order: 3
related: [comparing, files, editing, sharing, acl-basics]
---

FileEngine keeps a **full history** of every file. Changes never overwrite what came
before — each save becomes a **new version**, and the old ones stay available. This
means you can always look back, download an earlier copy, or roll a file back if a
change was wrong.

## How new versions are created

A new version is written whenever a file's contents change, including when you:

- **re-upload a file with the same name** into the same folder (see
  [uploading files](#files)),
- **save changes in the browser editor** (see [editing in your browser](#editing)),
  or
- update the file over [WebDAV](#webdav).

You don't "save as a new version" manually — it happens automatically each time.

## Viewing and restoring

Open a file's details drawer and choose the **Versions** tab. Versions are listed
**newest first**, each with its timestamp; the live one is marked **current**. For
each version you can:

- **download** — get that exact version as a file (its name is stamped with the
  version so you can tell copies apart).
- **restore** — roll the file back so an earlier version becomes the current one.
  Restoring doesn't erase history; it adds the restored content as a new current
  version, so you can always change your mind.

## Cleaning up old versions

If a file has many versions and you want to reclaim space, editors can prune history:
set **Keep newest** to how many recent versions to retain, then choose **Purge
older**.

> **Purging is permanent.** Unlike deleting a file (which is reversible), purged
> versions are gone for good. It's a deliberately high-trust action — see the
> **Cull versions** permission in [how permissions work](#acl-basics).

## Good to know

- **Folders aren't versioned** — the Versions tab shows *"Folders are not
  versioned."* Versioning applies to file contents.
- **Restoring and purging follow permissions.** You need edit access to restore, and
  the dedicated cull-versions permission to purge; without them you'll still see the
  history and can download past versions.
