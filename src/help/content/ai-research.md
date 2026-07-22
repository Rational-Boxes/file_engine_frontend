---
id: ai-research
title: The AI research chat
category: AI Research
keywords: [ai, chat, assistant, research, search, web search, citation, sources, llm, save, report, generate report, findings, provenance, chat log, audit, mcp, tools, external tools, consent, approve]
order: 1
related: [getting-started, editing, acl-basics]
---

The **Chat** tab is an AI research assistant that answers questions using your
documents and, when helpful, the web and connected external tools. It's built for
research and exploration — finding, summarizing, and cross-referencing information you
already have plus what's publicly available.

The screen has three parts: your **saved chats** on the left, the **conversation** in
the middle, and a **Tools** panel on the right.

## What it can do

- **Answer from your documents** — it can draw on files you have access to and cite
  them, so you can open the source and verify.
- **Search the web** — for questions that need current or external information, it
  can search and cite web sources (you control this — see below).
- **Use connected tools** — if your workspace has external tools set up, the
  assistant can call them, but only with your explicit approval each time (see
  *Using external tools* below).
- **Hold a conversation** — ask follow-ups; it keeps the thread's context.

## Asking a question

Type into the **Message…** box and press **Send** (or Enter). The empty chat prompts
you with *"Ask a question about your documents."* While the assistant works, you'll
see live progress — a blinking cursor as the answer streams in, *…thinking…* while it
reasons, and status notes like *🔎 Searching the web…* when it reaches out.

The assistant answers from documents **you already have access to** — there's no need
to attach files or pick a folder; it respects your [permissions](#acl-basics)
automatically.

## Web search — your choice

The **Tools** panel has a **Web search** toggle: *"Let the assistant search the web
when your documents don't have the answer."* Turn it on when you want the assistant to
look beyond your files, or leave it off to keep answers grounded only in your
documents. Your choice for the conversation always wins.

## Conversations

Your chats are **saved** and titled automatically from your first message. Use
**+ New chat** to start fresh, click an earlier conversation in the left list to
resume it, or use the **×** on a row to delete one (this happens immediately). The
list is newest-first; an empty list reads *"No saved chats yet."*

## Citations

Answers include numbered **citations** so you can check every claim against its
source. There are three kinds:

- **Document** citations show the file name — click to preview the file.
- **Web** citations show the site — click to open the page in a new tab.
- **🔌 External-tool** citations record that the assistant used a connected tool
  (shown as *integration · tool*). These are a provenance note, not a link — there's
  nothing to open.

## Using external tools

If a workspace administrator has connected external tools (via MCP integrations), the
assistant can use them to fetch information or take an action on your behalf — for
example, looking something up in another system. **Every such call asks your
permission first.**

When the assistant wants to use a tool, an approval prompt appears in the
conversation:

> **Allow *&lt;integration&gt;* to run `&lt;tool&gt;`?**

It shows **which tool** it wants to run and a **summary of what it will send**, with
two choices — **Approve** or **Deny**. Nothing happens until you decide, and if you
ignore it, the request **defaults to denied**. Tick **Don't ask again for this tool in
this conversation** to skip the prompt for that same tool for the rest of the current
chat only; the next new chat asks again.

After a tool runs, it's recorded as a **🔌 external-tool citation** on the answer, so
there's always a visible trace of what was used.

## Saving findings to a document

You can turn a conversation into a saved report two ways:

**Use the Generate report button.** In the **Tools** panel, choose **📄 Generate
report**. A **Generate report** dialog lets you pick exactly where it goes:

1. Browse to a destination folder (starting at **Home**), creating one with
   **＋ New folder** if needed.
2. Enter a **File name** (it saves as an `.html` document by default). A live hint
   confirms *"Saves to &lt;folder&gt; as &lt;name&gt;."*
3. Choose **Generate report**.

**Or just ask in chat** — say something like *"save this as a report"* or *"write
these results to a file."* The assistant browses folders you can access, proposes a
destination for you to confirm, and saves it there.

Either way, the report is saved as a **first-class file** in your storage — with its
own [permissions](#acl-basics), version history, and comments, and an automatic
preview. When it's done, an **📄 Open report** button appears on the answer, and the
assistant confirms the location in the chat, for example: *"✅ Saved the report to
/Reports/q3.html."* You need **write access** to the destination; if it can't save
there, it tells you why. Because reports are saved as HTML, you can also
[edit one in the browser](#editing) afterward.

## The chat log: reviewable provenance

Because a saved report is written by AI, every chat-generated report carries a
**chat log** — a durable, reviewable record of the conversation that produced it.
This is what makes an AI-authored document **auditable**: a reviewer can see *who*
asked for it, *when*, the exact prompts and answers, and the sources that grounded
it.

- **What's in it:** the full conversation transcript up to the save, the chatting
  user's identity and timestamp, the cited sources (documents, web pages, and any
  external tools used), and the AI model used.
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
- **You're in control of tools and the web.** The web toggle is yours to set, and no
  external tool runs without your explicit approval.
- **Be specific.** Clear, scoped questions ("summarize the risk section of the Q3
  report") get better answers than broad ones.
