---
id: sharing
title: Sharing files & setting permissions
category: Permissions
keywords: [share, sharing, permission, grant, revoke, acl, access, allow, deny, principal, user, role, everyone, inherit, template, manage]
order: 3
related: [acl-basics, acl-inheritance, share-links, files]
---

This page is the practical, "which buttons do I click" companion to
[how permissions (ACLs) work](#acl-basics) — it walks through granting and revoking
access from the app. Read that page first for the concepts (principals, allow vs
deny, and how rules are evaluated).

> **Sharing with someone who has no account here?** That is a different thing
> entirely — see [sending files outside your organisation](#share-links). The
> Access tab below only works for people who can already sign in.

## Where sharing lives

Open a file or folder's details drawer and choose the **Access** tab. There you'll
see the item's **owner**, **your effective permissions**, and the **access control
list** — the rules that decide who can do what.

You can only *edit* those rules if you have **Manage ACL** on the item (its owner
always does). If you don't, you'll see the rules but no controls to change them.

## Granting access

To add a rule:

1. **Pick who it's for.** Use the picker (*"Search users, roles, claims…"*) to choose
   a **User**, a **Role**, a **Claim**, or **Everyone** (type "everyone", "all", or
   "public").
2. **Tick what to grant.** Choose from permissions including **Read**, **Write**,
   **Delete**, **View versions** / **Retrieve version** / **Restore version**,
   **Manage ACL**, **Inherit**, and **Cull versions (destroys data)**. Read is
   selected by default.
3. **Choose the effect** — **allow** or **deny**.
4. Choose **Grant**.

### Quick templates

Two one-click templates cover the most common cases:

- **🏠 Private home folder** — give the picked **user** full access and deny everyone
  else.
- **👥 Gated section (role)** — give the picked **role** read + write and deny
  everyone else.

## Passing access down to new items

The **Inherit** permission is what makes a rule flow to **new** items created inside a
folder — this is the subtle part people most often get wrong, so it has its own page:
[how new items inherit permissions](#acl-inheritance). In short, only rules you mark
**Inherit** are copied into new children, as a one-time snapshot at creation.

For **existing** contents, folders offer a separate checkbox, **Apply to all contents
(files & subfolders)**, which pushes the grant (or revoke) down to everything already
inside — distinct from the Inherit flag, which only affects future items.

## Revoking access

Each permission on an existing rule has a small **✕** (*"Revoke …"*) next to it.
Removing all of a rule's permissions removes the rule. Remember that the list is
shown in **evaluation order** — User rules, then Roles & Claims, then Everyone, with
**deny winning within a tier** — so a broad allow can still be overridden by a more
specific deny.
