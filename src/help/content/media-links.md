---
id: media-links
title: Sharing a video or recording
category: Permissions
keywords: [video, audio, recording, media, watch, listen, play, stream, video link, video message, intro video, walkthrough, embed, website, iframe, oembed, viewers, audience, who watched, tracking, follow link, call to action]
order: 5
related: [share-links, sharing, versions]
---

A [share link](#share-links) hands someone a file to download. A **video link**
lets them *watch* it in their browser instead: no download, no account, no app.
It suits a walkthrough for a client, an introduction to a prospect, or a site
recording for a contractor. You can also see whether, and how much of it, they
watched.

The same works for audio. Wherever this page says *watch*, read *listen* for an
audio file.

## Before you start

You need the same permission as for any outside share link. If there is no
**Share** tab in a file's details drawer, ask an administrator to add you to the
sharing group.

Open a video or audio file's details drawer and choose **Share**. Under **What
to share**, pick **Let someone watch this**. If that choice is missing, this
deployment cannot prepare videos for the web, or video links are switched off.

A video link is for a short piece aimed at particular people. It is not a video
host. The deployment sets a maximum length (normally **10 minutes**), and every
link has a limit on the total amount it will stream. For a large public audience,
publish on PeerTube, YouTube or Vimeo and share that link instead.

## Who can watch

You choose one of three options. The choice decides how private the link is, so
it is shown as three choices side by side rather than hidden in a list:

- **Only people I name.** Type their email addresses. When they open the link
  they enter their address and are emailed a six-digit code, as with any other
  share link. Nobody else can watch, even with the URL.
- **Anyone with the link who gives an email address.** They type an address and
  the video plays. **The address is not checked**, so you see what they typed,
  marked *unverified*. You can list the people you expect; that list only marks
  them as *expected* among the viewers and does not keep anyone out.
- **Anyone with the link.** No sign-in at all. You must give it a public title
  and tick that you understand anyone the link is forwarded to can watch. Your
  administrator may have turned this option off.

## Creating the link

Besides who can watch, you can set:

- **Title viewers see.** It is shown above the player. If you leave it empty,
  the file name is used, except on a public link, which must have a title so it
  does not publish your internal file naming.
- **Sites that may embed it.** The websites allowed to show the player on their
  own pages, such as `https://www.example.com`. A public link can use `*` for
  anywhere.
- **Link to show with the video.** A title and a web address, such as *Read the
  full proposal* and `https://www.example.com/proposal`. It appears as a button
  under the player and opens in a new tab, so the video can end with an
  invitation to find out more. Use a full address starting with `https://`. If
  you leave the title empty, the site's name is shown. On a link that asks for an
  email address or code, viewers only see it once they are through to the video.
- **At most this many people.** A cap on how many different people can watch.
  Leave it empty for no limit.
- **Expiry** and a private **note**, as for any share link.

The form also tells you when the link will stop streaming, in total and as
roughly how many full viewings that is.

### Preparing the video

The first link on a file triggers a **web-playable copy**: 720p and 480p for
video. It is stored with the file. This takes a few minutes, and longer for a
longer video. **The link works straight away**: send it whenever you like, and
anyone who opens it early sees "still being prepared" until the copy is ready.

### Sending it

As with every share link, **the link is not emailed for you**, and **it is shown
only once**. Copy it before you close the panel. Alongside it you get:

- **For an email.** A still image of the video that links to the player, ready
  to paste into an HTML email.
- **Embed on a website.** Shown only if you listed sites that may embed it. It
  gives a one-line web component, a plain iframe, and an oEmbed address for
  WordPress, Notion and similar.

## What the viewer sees

They open the link and see the title and a still image. Depending on who can
watch, they give their email address (and, for named people, the emailed code),
or simply press play.

- Before they press **Watch**, the page tells them that the sender can see
  whether and how much of the video they watch. Pressing Watch is their
  agreement.
- The video streams, so it starts at once and they can skip ahead. The
  **Auto** quality picks 480p on a slow connection and 720p otherwise; they can
  also choose a quality themselves.
- There is no download button. The link plays the video; it does not hand over
  the file.
- If you added a link to show with the video, it appears under the player.

## Who watched

Open the link in the file's **Share** tab. For named people, or people who gave
an address, you see each person with:

- **How much they watched**, as a percentage and as a bar showing which parts
  they actually played. Skipping ahead does not count as watching.
- **Whether they finished.** *Finished* means their player reported the end and
  the video was actually streamed to them. *Probably finished* and *says finished
  (not confirmed)* mean one of those two signals is missing.
- **No playback data.** Their browser blocked the reports, so you cannot know
  how much they watched. This is **not** the same as 0% watched.

For a public link there are no names. You see how many people watched, how many
finished, which sites sent them, and a curve of how many were still watching at
each point.

**Export CSV** downloads the list. The same list is also kept up to date as a
hidden `audience.csv` beside the video, so anyone who can see the video can read
it, and an integration can collect it from there. It is deleted with the video.

The **Dashboard** shows your video links in the **Sharing** panel (*Preparing*,
*Not watched yet*, or *2 viewers · 1 finished*). It also adds items to **Needs
your attention**:

- **▶ Video opened**: the first time each person opens it. Not raised for
  public links.
- **✓ Video watched**: someone reached the end.
- **⚠ Video very popular** / **⚠ Video paused — too popular**: far more traffic
  than a video link is for. While it is paused, viewers are told to try again
  later. Consider publishing it on a video platform instead.

## Correcting the video

Upload a new version of the file in the usual way. Every link on it switches to
the new version once its web-playable copy is ready. Until then, viewers keep
seeing the previous version, never a half-prepared one. The link's details say
when a corrected version is being prepared.

## Stopping a link

- **Revoke** ends the link for everyone, including anyone in the middle of
  watching.
- **Remove** one address from a *named people* link, and that person's playback
  stops straight away. On an *anyone who gives an address* link the list only
  marks who you expected, so removing someone does not stop them watching.
  Revoke the link instead.
- If you lose access to the file yourself, or it is moved to the bin, the link
  stops working within a few minutes. A link never shows anything you could not
  see yourself.

As with any share link, revoking stops future viewing. It cannot take back what
someone has already seen.
