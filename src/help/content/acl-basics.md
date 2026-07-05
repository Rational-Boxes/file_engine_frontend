---
id: acl-basics
title: How permissions (ACLs) work
category: Permissions
keywords: [acl, permission, access, allow, deny, role, everyone, read, write]
order: 1
related: [acl-inheritance]
---

Every file and folder carries an **Access Control List** (ACL) — an ordered set of
rules that decide who can do what. This page explains how those rules are read. For
what happens to a *newly created* item, see
[how new items inherit permissions](#acl-inheritance).

## What a rule is

Each ACL rule has three parts:

- **A principal** — who the rule applies to. A principal is one of:
  - a **user** (a specific person),
  - a **role** or **claim** (a group of people),
  - **everyone** (all authenticated users).
- **An effect** — **allow** or **deny**.
- **A set of permissions** — what the rule grants or denies (see below).

## The permissions

| Permission | Lets the principal… |
|---|---|
| **Read** | See the item and its contents |
| **Write** | Change the item / upload new versions |
| **Delete** | Remove the item |
| **Manage ACL** | Change the item's permissions |
| **View / restore versions** | See and roll back to earlier versions |
| **Cull versions** | Permanently remove old versions (a deliberately separate, high-trust permission) |

## How rules are evaluated

When you try to do something, the rules are checked **top-down in tiers**, and the
**most specific tier that mentions you wins**:

1. **User** rules (rules naming you directly)
2. **Roles & Claims** rules (groups you belong to)
3. **Everyone**

**Within a tier, DENY beats ALLOW.** So if two role rules apply to you and one
denies Write, you don't get Write — even if the other allows it.

Anything not granted by any rule falls back to **read-by-default**: users can read
an item (and traverse its parent folders to reach it) unless a rule denies it.

## A quick example

Suppose a document has these rules:

- Role **editors** → allow Read, Write
- User **alice** → deny Write

Alice is in **editors**. Because a *user* rule is more specific than a *role* rule,
Alice's deny-Write wins: she can read the document but not change it. Everyone else
in **editors** can read and write.

## Who can change permissions

Only principals with **Manage ACL** on an item (and its owner, who always has full
control) can add or remove rules. If you can see the permissions editor's add/remove
controls, you have that permission on this item.
