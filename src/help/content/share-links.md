---
id: share-links
title: Sending files to people outside your organisation
category: Permissions
keywords: [share link, external, outside, guest, no account, link, expire, revoke, drop box, upload, recipient, code, otp, one-time code, zip, archive, contractor, client]
order: 4
related: [sharing, acl-basics, files]
---

The [Access tab](#sharing) shares with people who have an account here. This page
is the other case: sending something to a client, a contractor, or anyone else who
does not and will not have one.

You create a **share link**, send it to them yourself, and they open it in a
browser. They never get an account, and they never see anything except what you
shared.

## Before you start

Sharing outside the organisation is a permission your administrator grants
separately. If you do not see a **Share** tab in a file's details drawer, you do
not have it yet — ask an administrator to add you to the sharing group.

You also need to be able to read the thing you are sharing. A link can never give
anyone more access than you have yourself.

## The three shapes

Open a file or folder's details drawer and choose the **Share** tab:

- **A single file.** They download that one file.
- **A folder's contents.** They download everything directly inside it, as one
  ZIP.
- **A folder and everything below it.** The same, including subfolders, with the
  folder structure preserved inside the ZIP.
- **A drop box.** The opposite direction: they send files *to* you, into a folder
  you choose. Nothing in that folder is visible to them.

For the two folder shapes you are told the file count and roughly how big the ZIP
will be *before* you create the link — worth glancing at if you are about to send
it to someone on a phone.

## Creating the link

You will be asked for:

- **Who it is for** — one or more email addresses. Only these addresses can use
  the link, so it is not "anyone with the URL".
- **How long it lasts.** Links always expire. Your administrator sets a maximum;
  you can choose anything shorter.
- **How many times it can be used.** A "use" is one person opening the link and
  starting a download — not one file. Re-downloading within the same visit does
  not cost another.
- **A note** (optional) — a short description so you can recognise the link later.

### You send the link yourself

The system does not email the link. Copy it and send it however you normally talk
to that person.

This is deliberate: the message is more convincing coming from you, and you often
have context to add. It also means **the link is only as private as the way you
send it** — think about that if the contents are sensitive.

**The link is shown once.** Copy it before you close the dialog. If you lose it,
revoke the link and make a new one; nobody can recover it for you, including your
administrator. That is a property of how it is stored, not a policy.

## What the recipient sees

They open the link and are asked for their email address. If it is one of the
addresses you listed, they are emailed a **six-digit code**; they type it in and
the download appears.

A few things worth knowing, because recipients ask:

- The code expires after about **10 minutes**. They can request another, and the
  page tells them how long until they can.
- **Always use the code from the newest email.** Requesting a new one invalidates
  the previous one, which matters when the first email arrives late.
- After several wrong codes the link locks for about **15 minutes**. The page says
  so, so they can tell "wait a bit" from "this is broken".
- The page tells them nothing about your organisation, the folder it came from, or
  who else the link was sent to.

If someone reports that the code never arrives, check the address on the
**recipients** list first — a typo produces exactly the same screen as a working
address, on purpose.

## Keeping track

The **Share** tab on the item lists every link on it, and for each one: who it is
for, whether each person has used it, and when.

Your **Dashboard** has a **Sharing** panel with everything you currently have
open, and anything that needs you — a link that has stopped working, a code that
could not be sent, files that have arrived in a drop box. It is empty most days,
which is the point.

You will also see items in **Needs your attention** when a drop arrives, when
someone opens a link for the first time, and if someone appears to be guessing
codes against one of your links.

### Status badges

- **Active** — working normally.
- **Used up** — it hit the number of uses you set. Make a new link if that was
  premature.
- **Locked** — too many wrong codes recently. It unlocks itself; you do not need
  to do anything, but it is worth asking whether the recipient is actually stuck.
- **Not working** — the link cannot be used and it is not the recipient's fault.
  Almost always this means *you* lost access to the item, or it was moved to the
  bin, or the exact version you shared has since been cleaned up. The panel tells
  you which.

## Stopping a link

**Revoke** ends a link immediately, for everyone holding it.

You can also **remove one address** instead. That person loses access and the link
keeps working for everyone else — much better than revoking and re-issuing, which
invalidates the URL for people who already have it.

Be clear about what revoking does: **it stops future downloads. It does not
un-send anything already downloaded.** If something has been collected, revoking
is still worth doing, but treat the contents as out.

## Drop boxes

A drop box link lets someone send files *in*. Files land in the folder you chose,
owned by you, exactly as if you had put them there.

Files that arrived this way are marked in the file list with the **verified email
address** of whoever sent them. That marker comes from the record of the transfer
itself, not from anything editable on the file, and it survives the file being
moved or renamed.

If someone typed a name when sending, you will see it too — treat it as a claim,
not a fact. The email address beside it is the part that was actually checked.

## What is recorded

Everything: creating a link, adding or removing an address, every code request,
every failed code, every download, and every file dropped. Each entry names the
verified email address of the outside person involved.

Practically, that means **"who did we ever send this to, and did they open it?"**
has an answer, months later, without anyone having to have kept notes.

Administrators can additionally see every link in the organisation, filter by
creator or recipient domain, and revoke them. They cannot create links on your
behalf, cannot recover a link's URL, and see only files their own permissions
already allow.
