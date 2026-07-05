---
id: acl-inheritance
title: How new items inherit permissions
category: Permissions
keywords: [inherit, inheritance, acl, new, folder, parent, child, create]
order: 2
related: [acl-basics]
---

A common assumption is that a new file "has the same permissions as the folder it's
in." That's **not quite** how it works, and the difference matters. This page
explains exactly what a new item ends up with. For how permissions are read once
they're set, see [how permissions (ACLs) work](#acl-basics).

## The one thing to remember

> A new item inherits **only** the parent folder's rules that are explicitly marked
> as **inheritable** — not the whole folder ACL — and it does so as a **one-time
> copy** taken at the moment of creation.

## What that means in practice

**Only flagged rules are copied.** A folder rule is handed down to new children only
if it carries the *inheritable* flag. A rule that grants access to the folder itself
but isn't flagged inheritable is **not** copied to new items inside it.

**It's a snapshot, not a live link.** The rules are copied once, when the item is
created. If you change the folder's permissions *afterwards*, existing items inside
it are **not** updated — they keep the rules they were created with.

**Inheritance cascades.** An inherited rule keeps its inheritable flag, so it
continues to propagate into sub-folders and their new children, and so on down the
tree.

**The creator always gets full control.** Whoever creates an item receives full
permissions on it (including the ability to manage its ACL and to pass rules down),
regardless of what the parent folder had.

## Worked example

A folder **Projects** has two rules:

- Role **staff** → allow Read *(marked inheritable)*
- User **bob** → allow Read, Write *(not marked inheritable)*

Alice creates a new file **plan.docx** inside **Projects**. The new file ends up
with:

- **Alice** → full control (she created it)
- Role **staff** → allow Read (the inheritable rule was copied)

Bob's rule is **not** copied, because it wasn't marked inheritable — Bob has no
special access to `plan.docx`. And if an administrator later adds a new inheritable
rule to **Projects**, `plan.docx` won't get it (it already exists); only items
created *after* that change will.

## Why it's designed this way

This gives **selective, predictable** inheritance: you choose which folder rules
should flow to new content by marking them inheritable, rather than every rule
blanket-applying to everything created underneath. It also means changing a folder's
permissions can't silently alter access to documents that already live in it.
