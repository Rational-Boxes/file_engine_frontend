---
id: account-security
title: Signing in & account security
category: Your account
keywords: [login, sign in, sso, oauth, password, reset, forgot, 2fa, two-factor, mfa, totp, authenticator, recovery, backup codes, profile, consent, authorize]
order: 1
related: [webdav, getting-started]
---

This page covers how you get into FileEngine and how to keep your account secure —
signing in, two-factor authentication, and your profile.

## Signing in

On the sign-in page you can:

- **Use your username and password** — fill in **Username** and **Password** and
  choose **Log in**.
- **Sign in with a provider** — if your workspace has single sign-on set up, one or
  more **Sign in with …** buttons appear (for example, *Sign in with Google*).
  Choosing one hands you to that provider and brings you back signed in.

Forgot your password? Use **Forgot password?** to request a reset link by email.

## Two-factor authentication (2FA)

Two-factor authentication adds a second step at login — a rotating code from an
authenticator app — so a stolen password isn't enough on its own. Some organizations
require it.

**Turning it on** (in your **profile**, under **Two-factor authentication**):

1. Choose **Set up authenticator app**.
2. **Scan the QR code** with an app like Google Authenticator, 1Password, or Authy —
   or type the shown key in manually.
3. Enter the current 6-digit code and choose **Confirm & enable**.

**Save your recovery codes.** After enabling, you're shown a one-time list of
**recovery codes** — the way back in if you lose your phone. Store them somewhere
safe; they won't be shown again. Each works once. You can later **Regenerate recovery
codes** (which invalidates the old set) or **Turn off** 2FA — both ask for a current
code to confirm.

**Signing in with 2FA on:** after your password, you're asked to confirm it's you.
Depending on what's available you can use your **Authenticator** app, an emailed code
(**Email**), or a **Recovery code**.

## Passwords

Change your sign-in password from your profile's **Change password** card (enter your
current password and a new one). Password rules are shown live as a checklist and vary
by deployment — typically a minimum length and a mix of character types. The save
button stays disabled until every rule is met.

> Your sign-in password is separate from the **WebDAV & MCP credentials** you generate
> for connecting apps and drives — see [connecting to your computer](#webdav). Use a
> scoped credential there, not your account password.

## Your profile

From **My profile** you can set your **Display name**, **First name**, **Last name**,
and an **Avatar image URL**. Your email, tenant, and roles are shown but managed by
your organization.

## Authorizing other apps

If an external application asks to connect to your FileEngine account, you'll see an
**Authorize access** screen listing exactly what it's requesting (for example,
*Verify your identity*, *Your email address*, *Your roles in this tenant*). Choose
**Allow** to grant it or **Deny** to refuse; **Don't ask again for this application**
skips the prompt next time. Only approve applications you trust.
