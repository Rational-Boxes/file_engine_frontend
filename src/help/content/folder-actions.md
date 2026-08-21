---
id: folder-actions
title: Automating a folder with actions
category: Working with files
keywords: [folder action, automation, automatic, rule, trigger, binding, sorter, classify, route, notify, email, review, approve, reject, move, webhook, integration, inbox, workflow, run log]
order: 6
related: [files, comments, share-links, versions]
---

A folder can be told to *do something* when files arrive in it. Drop a drawing
into the right folder and it can be classified and filed, sent for review, mailed
to the people who care, or pushed to another system — without anyone remembering
to do it.

## Where it lives

Open a **folder's** details drawer and choose the **Actions** tab. It only
appears on folders, because an action is always attached to a folder rather than
to a single file.

Inside are two views:

- **Bindings** — the rules attached to this folder.
- **Run log** — what actually happened, most recent first.

## Attaching an action

A rule (a *binding*) is three choices:

1. **What kind of action** — one of the five below.
2. **Which events trigger it** — a file created here, a file moved in, a
   conversion finishing, a review being approved or rejected. Each action type
   offers only the events that make sense for it.
3. **The action's own settings** — where to move things, who to notify, and so on.

Actions apply to the folder you attached them to. They are not inherited by
subfolders, so a nested inbox needs its own binding.

## The five actions

### Sort automatically

Classifies a file by what it *says*, not what it is named, and routes it to a
destination folder. It reads the text the system already extracted, scores it
against a classifier set, and moves the file to the folder for the winning
category.

The realistic setup is a single **inbox** folder with a sorter on it: everything
gets dropped there and ends up where it belongs. A file that matches nothing is
left where it is rather than guessed at — an unsorted file is easy to spot, and a
confidently misfiled one is not.

### Notify someone

Emails the people you list whenever the trigger fires. One message per event, as
it happens, rather than a daily summary. You can name a **role** instead of
individuals, which reaches everyone in it and keeps working as people join and
leave.

### Ask for a review

Raises a review request on the file, assigned to the reviewers you choose, as
soon as it lands. The request appears in their **Reviews** inbox on the
Dashboard, alongside everything else waiting on them — see
[comments & discussions](#comments).

### Move when a review is decided

Moves the file to one folder when a review is approved and to another when it is
rejected. Either outcome can be left blank if you only care about one.

Combined with the previous action this composes into a pipeline across folders:
a file lands in *Incoming*, a review is raised automatically, and when a human
approves it the file moves itself to *Approved*. Nobody has to shepherd it.

### Call another system

POSTs a description of the event to a URL you provide — for wiring FileEngine
into something else. Optionally restricted to certain file types, with
authentication, and it retries a few times before giving up.

Because this one reaches outside, it is usually configured by an administrator.

## Watching what happened

The **Run log** shows every run for the folder: whether it succeeded, which
action it was, which file, when, and what happened. It is the first place to look
when something did not go as expected — most surprises are a trigger that did not
match rather than an action that failed.

An action that fails does not damage the file. It is recorded as failed and left
alone.

## Things worth knowing

**Actions run as the system, not as you.** A file moved by an action keeps the
permissions of where it lands, exactly as if it had been put there directly.
Someone who cannot see the destination folder will not see the file after it
moves.

**Automatic moves are still moves.** A file that sorts itself into another folder
is no longer where the person who uploaded it left it. Worth mentioning to people
who use a sorted inbox, or the first few weeks generate confused questions.

**Nothing is retroactive.** Attaching an action affects files that arrive *after*
it, not what is already in the folder.
