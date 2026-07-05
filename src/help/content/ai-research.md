---
id: ai-research
title: The AI research chat
category: AI Research
keywords: [ai, chat, assistant, research, search, citation, sources, llm, save, report, findings, provenance, chat log, audit]
order: 1
related: [getting-started, acl-basics]
---

The **Chat** tab is an AI research assistant that answers questions using your
documents and, when helpful, the web. It's built for research and exploration —
finding, summarizing, and cross-referencing information you already have plus what's
publicly available.

## What it can do

- **Answer from your documents** — it can draw on files you have access to and cite
  them, so you can open the source and verify.
- **Search the web** — for questions that need current or external information, it
  can search and cite web sources.
- **Hold a conversation** — ask follow-ups; it keeps the thread's context.

## Conversations

Your chats are **saved**. Use **+ New chat** to start fresh, pick an earlier
conversation from the list to resume it, or delete ones you no longer need.

## Citations

Answers include **citations** — both to your documents and to web pages. Click a
document citation to preview the file; web citations open the page in a new tab.
Use them to check the assistant's claims against the original material.

## Saving findings to a document

You can ask the assistant to **save its findings as a document** — for example,
"save this as a report" or "write these results to a file." You don't click a
button; you just ask, and the assistant handles it:

1. It **browses your folders** (only ones you can access) and **proposes a
   destination** — a folder and a file name — for you to confirm.
2. It writes the report and **saves it as a normal file** in your storage. The
   saved report is a first-class file like any other: it has its own
   [permissions](#acl-basics), version history, and comments, and a PDF preview is
   generated automatically.

The assistant confirms in the chat with the saved location and the new file, for
example: *"✅ Saved the report to /Reports/q3.html."*

You need **write access** to the destination folder. If the assistant can't save
there, it tells you why.

## The chat log: reviewable provenance

Because a saved report is written by AI, every chat-generated report carries a
**chat log** — a durable, reviewable record of the conversation that produced it.
This is what makes an AI-authored document **auditable**: a reviewer can see *who*
asked for it, *when*, the exact prompts and answers, and the sources that grounded
it.

- **What's in it:** the full conversation transcript up to the save, the chatting
  user's identity and timestamp, the cited sources (documents and web pages), and
  the AI model used.
- **Where to find it:** open the report's preview. If it was generated from a chat,
  a **🧾 Chat log** tab appears next to the Document tab — that's the provenance
  record.
- **Who can see it:** the chat log follows the report's permissions, so anyone who
  can read the report can review how it was made. Personal information in the
  transcript is redacted, while public web content is kept as-is for reference.
- **It stays with the report:** the log is part of the artifact — it versions and
  is removed together with the report.

## Good practice

- **Verify important answers.** The assistant can be wrong or incomplete. Treat its
  output as a well-researched draft, not final authority — follow the citations.
- **It only sees what you can see.** The assistant respects
  [file permissions](#acl-basics); it won't surface content you don't have access
  to.
- **Be specific.** Clear, scoped questions ("summarize the risk section of the Q3
  report") get better answers than broad ones.
