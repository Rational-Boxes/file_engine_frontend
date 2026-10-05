# PDF Viewer — Range Streaming Plan

**Status:** Research / not started — nothing here is implemented
**Branch:** `research/pdf-range-streaming`
**Author:** (drafted with Claude Code)
**Date:** 2026-10-05

Can the byte-range streaming built for media links (MEDIA_SHARE.md) make large
documents start rendering before the whole file has transferred? **Yes, for
PDFs** — PDF.js is designed for it and the server side already supports it. This
document records what exists, what stops it today, the caveats that decide how
much it helps, and a staged plan with the measurements that should gate each
stage.

---

## 1. Findings

### 1.1 The server side already works for documents

The media work made the bridge serve true byte ranges on the **ordinary
authenticated download route**, not only under playback tickets:

- `GET /api/v1/files/{uid}/content` with `Range: bytes=N-M` and a Bearer token
  returns `206` with an exact `Content-Range: bytes N-M/total`, `Content-Length`
  and `Accept-Ranges: bytes`, or `416` (`http_bridge/src/http_server.cpp`
  `getContent`, `include/range_response.h`).
- The range is handed to the **core** as `offset`/`length`; the core reads only
  that window and reports the version's total on its **first frame** (core
  `fix/range-metadata-on-first-frame`, deployed in 1.9.46+).
- A **whole-file** response also carries `Content-Length` = total. PDF.js needs
  that on its first response before it will switch to range mode — a chunked
  answer without a length silently disables ranges.
- It is the app's own origin (`/api` on `<tenant>.<base>`), so there is no CORS
  preflight; the edge does not gzip this path (compression would also defeat
  ranges).

### 1.2 PDF.js uses ranges natively

`getDocument({ url, httpHeaders, ... })` opens a full request; if the answer says
`Accept-Ranges: bytes` with a length, PDF.js fetches the byte ranges it needs —
the trailer/xref (at the END of most PDFs), then the objects of the page being
drawn — and retries parsing as data arrives (`NetworkPdfManager` /
`ChunkedStreamManager` catch `MissingDataException`, request the range, retry).
Relevant options:

| Option | Default | Meaning here |
|---|---|---|
| `rangeChunkSize` | 65 536 | Bytes per range request. Each one is a bridge → core round trip with its own ACL check; 64 KiB means many. |
| `disableRange` | false | Must stay false. |
| `disableStream` | false | Whether the initial full request keeps streaming alongside ranges. |
| `disableAutoFetch` | false | If true, PDF.js stops fetching the rest of the file in the background once the visible page is satisfied. |
| `httpHeaders` | — | Static headers (Bearer, `X-Tenant`) fixed at load time — see §2.3. |

Alternatively a **`PDFDataRangeTransport`** lets the app supply the bytes itself:
PDF.js calls `requestDataRange(begin, end)` and the app answers with
`onDataRange(begin, chunk)`. That puts every fetch through the app's own client.

### 1.3 No playback ticket is needed

Video needed a ticket only because a `<video>` element cannot send an
`Authorization` header. PDF.js can (headers or a transport). The ticket's MIME
allowlist (`playbackMimeFor`) is deliberately audio/video only, and should stay
that way: the tenant origin must never serve a type a browser would execute.

### 1.4 What stops it today

The viewer never lets PDF.js stream. `DocumentPreview.vue` calls
`renditionObjectUrl(uid, 'application/pdf')` (`services/renditions.ts`), which
**downloads the whole file** (`fileService.downloadFile`) into a `Blob`, wraps it
in a `blob:` URL, and only then `PdfViewer.vue` calls
`getDocument({ url: props.src, ... })`. PDF.js sees a local object URL; nothing
renders until the last byte has arrived. The markup view does the same with
`markupUrl` (the client-produced `-markup.pdf` rendition).

---

## 2. Caveats that decide the benefit

### 2.1 How the PDF was written

- **Linearized ("fast web view")** PDFs put page 1 and its objects at the front:
  first paint after the first chunk.
- **Non-linearized** (most): xref/trailer at the END. PDF.js range-fetches the
  tail, then page 1's objects — a few round trips, still far earlier than a full
  download for a large file.
- **Shared heavy resources** (a large embedded font, one full-page scan image)
  must arrive before the page that uses them can draw.
- **CSAI's own output is not linearized.** Office → PDF renditions are produced
  by conversion with no `qpdf --linearize` pass. That is the cheapest structural
  win available to us (§4, stage 3).

### 2.2 v1-stored files make ranges expensive — measure before relying on it

The core reads a range cheaply only for **storage v2** (everything written since
core 1.9.37, 2026-10-01): `range_method = "seek"`. For **v1** versions
(`file_engine_core/core/src/filesystem.cpp`):

- the encrypted/compressed path **loads the whole version into memory** and then
  windows it (`range_method = "scan"`, "whole-buffer fallback");
- the plain local-file path reads from byte 0 up to the window ("scan").

PDF.js issues dozens to hundreds of range requests for a large document. On a
large v1 file that is dozens of whole-file reads in the core — **worse** than one
download. Production holds a large v1 corpus (everything before 2026-10-01). So:

- the viewer must know which it is talking to. Options: a response header from
  the bridge (`X-Range-Method: seek|scan`, from the core's first frame, which
  already carries it), or the version's `storage_format` on the version listing;
- on `scan`, fall back to today's single whole download (or `disableRange`).
- A background re-write of hot v1 PDFs to v2 is a possible later optimisation,
  out of scope here.

### 2.3 Token lifetime

Bridge tokens live **900 s**; the SPA refreshes them. `httpHeaders` are fixed at
`getDocument` time, so a document left open longer than that would start failing
its later range requests (scrolling to an unfetched page, search, print). This is
why the plan uses a **`PDFDataRangeTransport`** whose fetches go through the app's
existing authenticated client (which already refreshes and sets `X-Tenant`),
rather than `url` + `httpHeaders`.

### 2.4 Features that need the whole document anyway

Markup editing and `saveDocument()`, find-in-document across all pages, print,
and the thumbnail sidebar all pull the whole file eventually. Streaming improves
**time to first page**, not total transfer. Recommended:

- `disableAutoFetch: true` while the user is only reading;
- switch to fetching everything (or simply let those features trigger it) when
  the user enters markup mode, starts a search, prints or opens thumbnails.

### 2.5 Request count and chunk size

64 KiB chunks mean many bridge → core round trips, each with a permission check
and (on v2) a block index lookup. Start at **512 KiB** and tune from the
measurements in §5. Coalesce adjacent requests where PDF.js asks for neighbours.

### 2.6 What this does not cover

- **Other formats.** Images, spreadsheets and Office files are viewed through
  their PDF rendition, so they benefit. 3D/IFC/CAD are parsed whole by their
  viewers; ranges do not help there.
- **External shares.** Media links stream through the media door on
  `<tenant>-media`; documents shared externally are plain share-link downloads.
  Streaming PDFs to external recipients is a separate decision (the media door's
  MIME allowlist excludes PDF on purpose).

---

## 3. Design

### 3.1 A range-backed source for PdfViewer

- New `src/services/pdfRangeSource.ts`: given a file uid (or rendition uid),
  returns either
  - a `PDFDataRangeTransport` (length + first chunk known) whose
    `requestDataRange(begin, end)` issues `GET /api/v1/files/{uid}/content` with
    `Range: bytes=begin-(end-1)` through the authenticated API client, and feeds
    `onDataRange`; or
  - the existing whole-file `blob:` URL when ranges are unsuitable (§2.2) or the
    first response does not advertise ranges.
- The first request is a `Range: bytes=0-(chunk-1)`: it yields the first chunk,
  `Content-Range` gives the total length, and (with the header in §3.2) the range
  method — one round trip decides the mode.
- `PdfViewer.vue` accepts a `source` (`{ kind: 'range', transport } | { kind:
  'url', url }`) instead of only `src`; `getDocument({ range: transport,
  rangeChunkSize, disableAutoFetch: true, ...existing font/cmap options })`.
- Cancellation: closing the drawer aborts in-flight range fetches
  (`AbortController`), as the video path already does.

### 3.2 Bridge: say how a range was served

Add `X-Range-Method: seek|scan` to `getContent` responses, taken from the core's
first frame (`range_method` is already reported). Additive; no client is required
to read it. Lets the SPA choose the mode on the first request instead of guessing
from latency.

### 3.3 CSAI: linearize the PDFs we produce

After a successful Office → PDF conversion, run `qpdf --linearize` (fall back to
the unlinearized file if it fails). Applies only to renditions CSAI writes;
user-uploaded PDFs are left untouched (rewriting a user's file is not ours to do).

### 3.4 Drawer preview: page 1 only

Decided 2026-10-05. The quick preview in the file drawer is a **page-1 poster**,
not a viewer:

- `getDocument` with the range source and `disableAutoFetch: true`; render page 1
  into a single canvas; never call `getPage(n > 1)`.
- No thumbnail strip, page navigation, find, print or markup in the drawer — each
  of those would pull the whole document and defeat the point.
- "Open" (the full viewer) creates its own loading task with the normal fetch
  policy (§2.4); it does not inherit the drawer's partial data.
- For a linearized PDF this is one or two range requests; for a non-linearized one
  it is the trailer/xref plus page 1's objects. Either way the bytes fetched are
  bounded by page 1, not the document size — the measurement in §5 records bytes
  at first render to prove it.
- On the v1 fallback (§2.2) the drawer still downloads the whole file today; stage
  0 should record whether that makes a page-1 preview of a large v1 PDF worth
  serving from the existing `poster` rendition (a PNG of page 1 produced at
  ingest) instead.

### 3.5 Markup view

The markup rendition (`-markup.pdf`) is loaded with the same source. Entering
markup mode on the base PDF switches PDF.js to fetch the remaining data before
editing is enabled (`saveDocument()` needs the complete document).

---

## 4. Stages

| Stage | Change | Repos | Gate |
|---|---|---|---|
| 0 | **Measure** (§5) on dev and on a production-shaped corpus: first-page and total time, v1 vs v2, linearized vs not, 2 / 20 / 200 MiB | frontend (bench script) | Numbers recorded here before any code ships |
| 1 | Range source + PdfViewer `source`; whole-download fallback; drawer preview page 1 only (§3.4); full fetch on open/markup/search/print | frontend | First page faster on v2 large files; drawer fetches only page 1's bytes; no regression on v1; markup round-trip unchanged |
| 2 | `X-Range-Method` header; SPA picks mode from it | http_bridge, frontend | v1 files never take the range path |
| 3 | `qpdf --linearize` on CSAI PDF output | convert_search_ai | New Office renditions report linearized; first paint after first chunk |
| 4 (optional) | Re-write hot v1 PDFs to v2 | core / ops | Only if stage 0 shows v1 PDFs are common in active use |

---

## 5. Measurement plan (stage 0)

- Reuse the media E2E harness pattern (`e2e/media-streaming.mjs`: playwright-core,
  cached Chromium, **CDP network throttling**) as `e2e/pdf-streaming.mjs`.
- Corpus: generated PDFs at 2 / 20 / 200 MiB, each linearized and not, uploaded
  so they are stored v2; plus the same files forced into v1 on a throwaway core
  database (to measure the scan cost honestly).
- Record per case: time to first rendered page (PDF.js `pagerendered` for page
  1), bytes received at first render, total requests and bytes, core
  `range_method` per request (bridge log), and peak core RSS for the v1 cases.
- Pass criteria for stage 1: on a throttled 10 Mbit/s link, a 20 MiB v2 PDF shows
  page 1 having received ≤ 25 % of the file; a v1 file of the same size is no
  slower than today's whole download.
- The bench must also run the control (today's whole-download path) so the
  comparison proves the discrimination, as `media-streaming.mjs` does.

---

## 6. Risks and open questions

- **Range storms.** A malformed or adversarial PDF can make PDF.js request many
  tiny ranges. Coalescing and the larger chunk bound this; the bridge's existing
  per-request limits apply. Worth a cap on concurrent range fetches per document
  in the transport.
- **Object-store misses.** A version not cached on the core host is fetched from
  the object store before the window is served; the first range on a cold file
  pays that. Measure in stage 0.
- **Encrypted v1 whole-buffer fallback** holds the whole decrypted version in
  core memory per request. Stage 2's fallback is what prevents concurrent viewers
  of a large v1 PDF from multiplying that.
- **Resolved (owner, 2026-10-05): the drawer's preview is page 1 only.** It
  renders the first page and never fetches past what page 1 needs
  (`disableAutoFetch: true`, no thumbnails, no page navigation, no search). The
  rest of the document is fetched only when the user opens the full viewer. See
  §3.4.
- **Open question:** is a `storage_format` field on the version listing
  preferable to the `X-Range-Method` header (lets the SPA decide before the first
  request)?

## 7. References

- `http_bridge/src/http_server.cpp` `getContent`; `http_bridge/include/range_response.h`
- `file_engine_core/core/src/filesystem.cpp` (range paths, `range_method`)
- `frontend/src/components/PdfViewer.vue` (`getDocument`), `DocumentPreview.vue`
  (`pdfUrl`, `markupUrl`), `services/renditions.ts` (`renditionObjectUrl`)
- `convert_search_ai/design_documents/MEDIA_SHARE.md` (§6.6 range contract, Q10)
- PDF.js: `getDocument` options, `PDFDataRangeTransport`, `ChunkedStreamManager`
