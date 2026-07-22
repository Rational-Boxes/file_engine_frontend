---
id: webdav
title: Connect FileEngine to your computer
category: Working with files
keywords: [webdav, mount, drive, finder, explorer, davfs, credential, key, secret, mcp, network, folder, connect, password]
order: 4
related: [files, versions, account-security]
---

Besides the web app, you can connect to your FileEngine storage from your computer
over **WebDAV** — so your files appear as a network drive in Finder, File Explorer,
or a WebDAV client. Files you add or change there flow through the same versioned
store, so history and permissions still apply.

## Create a credential (not your password)

You don't connect with your account password. Instead you generate a **scoped
credential** — a `key : secret` pair you can revoke on its own without affecting your
login. Go to your **profile** and find the **WebDAV & MCP credentials** card:

1. Enter a **Label** (for example, `MacBook Finder`) so you can recognize it later.
2. Tick **WebDAV** (and/or **MCP** for AI-agent access).
3. Choose **Add credential**.

> **The secret is shown only once.** Copy it right away with **Copy key:secret**.
> If you lose it, use **Regenerate** to get a new one — the old secret stops working.

Each credential is listed with its label, scopes, and when it was **last used**, and
can be **Regenerate**d or **Revoke**d individually. Revoking immediately cuts off any
client using it.

## Connecting

After you create a WebDAV credential, the card offers ready-made **mount scripts**
for **Bash** (macOS/Linux) and **PowerShell** (Windows). Download or copy one and run
it to mount FileEngine as a drive. For safety the scripts never contain your secret —
your operating system prompts for it (use the **key** as the username and the
**secret** as the password).

If you'd rather set it up by hand, point your WebDAV client at your deployment's
drive address and sign in with the same `key` / `secret`.

## Related

- The **MCP** scope on a credential lets an AI agent connect to your files instead of
  a file browser — a separate use of the same credential mechanism.
- For your login, SSO, and two-factor settings, see
  [signing in & account security](#account-security).
