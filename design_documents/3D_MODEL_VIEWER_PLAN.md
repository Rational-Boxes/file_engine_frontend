# 3D / BIM Model Viewer — Frontend Development Plan

Bringing the **xeokit** 3D/BIM viewer into the Vue 3 SPA so users can open and
explore models (IFC, glTF/GLB, CityJSON, point clouds, meshes) inline, alongside
the existing document previews. This is the **frontend half** of the
convert_search_ai 3D feature; the backend (conversion to the XKT rendition +
searchable-text indexing) is specified in
`convert_search_ai/design_documents/XEOKIT3D_PLUGIN.md`.

The SPA stays a **pure client**: the model is loaded from a pre-converted **XKT
rendition** (a hidden child of the source file) fetched through the existing
authed download path — no new service calls, no client-side conversion.

```
                       ┌─ REST /v1/files/{xktChildUid}/content ─▶ http_bridge ─▶ core
Browser (this SPA) ────┤   (the <version>-model.xkt rendition, bytes)
  Vue 3 · xeokit-sdk   └─ search/chat already index the model's text (CSAI)
```

---

## 1. Current state (baseline)

- **Renditions are half-wired.** `services/renditions.ts` parses a file's hidden
  children named `<version>-<fmt>.<ext>` into a typed set; today its `KNOWN`
  vocabulary is `thumbnail | preview | pdf | poster`. `fileService.listRenditions`
  and `downloadFile` exist; `DocumentPreview.vue` / `PreviewView.vue` /
  `PdfPreviewOverlay.vue` already render the document set.
- **No 3D support.** There is no `model` rendition fmt, no viewer component, and
  no `@xeokit/xeokit-sdk` dependency.
- **Backend produces the rendition.** CSAI's `Xeokit3DPlugin` writes a
  `<version>-model.xkt` hidden child (`fmt=model`, `ext=xkt`,
  `application/octet-stream`) and indexes the model's human-readable strings for
  search/RAG. See `XEOKIT3D_PLUGIN.md` §6–§8.

## 2. Goal & scope

**In scope (v1):**
- A read-only 3D viewer for files that have a `model` (`.xkt`) rendition, opened
  into a **maximal full-screen overlay** so 3D navigation is never cramped (§5.1).
- A **collapsible sidebar** inside the overlay for the **object tree** + selected-
  object metadata, collapsing to give the canvas the entire overlay (§5.2).
- A **navigation-cube overlay** — a small in-canvas corner widget for orientation,
  available even when the sidebar is collapsed (§5.2). **Temporarily disabled**
  (gated behind `NAVCUBE_ENABLED=false`) due to upstream xeokit-sdk bug
  [#2016](https://github.com/xeokit/xeokit-sdk/issues/2016) — `NavCubePlugin`
  throws `Missing input materialEmissive` and crashes the render loop in
  2.6.104–2.6.112 (the current latest). Re-enable when fixed upstream.
- **Format-specific icons** (IFC / glTF / CityJSON / point cloud / mesh) and a
  **"3D preview" link/affordance** on file tiles — entirely frontend-owned (the
  backend ships no raster thumbnail for 3D in v1, by design).

**Out of scope (v1):** markup/BCF, measurement, annotations, model federation
(multiple XKTs in one scene), and server-rendered thumbnails. These are noted as
follow-ons in `XEOKIT3D_PLUGIN.md` (§13).

## 3. Dependency & licensing

- Add **`@xeokit/xeokit-sdk`** (v2 line; XKT + `XKTLoaderPlugin`) to
  `package.json`. **It is AGPL-3.0** — acceptable (the SPA is GPL-3.0) but it
  carries the AGPL §13 network-source obligation:
  - **Lazy-load** xeokit via dynamic `import()` so it's pulled only when a 3D file
    is opened (keeps the main bundle lean and isolates the AGPL code).
  - Add a visible **"Source / licenses"** link (or `ABOUT`/footer entry) pointing
    at the xeokit source + this repo, and record xeokit's AGPL in the app's
    attribution notices.
- Keep all xeokit usage **behind one component** (`Model3DViewer.vue`) so a future
  swap to a commercial xeokit license touches a single file.

## 4. Cross-cutting foundation — extend the rendition vocabulary

`services/renditions.ts`:
- Add `'model'` to `RenditionFmt` and the `KNOWN` allowlist (ext `xkt`). Without
  this the `<version>-model.xkt` child is silently ignored.
- `model` is **not an image** — ensure `thumbnailImage()` / `previewImage()`
  continue to ignore it (they already gate on image extensions), so it never
  leaks into still-image tiles.
- Add a helper `modelRendition(set): RenditionRef | undefined` and expose the
  `.xkt` bytes as an `ArrayBuffer` (reuse `downloadFile`, not an object URL — the
  XKT loader wants the raw buffer).

`utils/` (new small helper):
- `modelFormat(file): '3d-ifc' | '3d-gltf' | '3d-cityjson' | '3d-pointcloud' |
  '3d-mesh' | null` derived from the **source** MIME/extension, used to pick the
  format-specific icon and to decide whether to show the "3D preview" affordance.

## 5. Workstream A — the viewer component

**`components/Model3DViewer.vue`** — the canvas + xeokit lifecycle:

- Props: `fileUid` (source) and/or a resolved `RenditionRef` for the `.xkt` child.
- On mount: dynamic `import('@xeokit/xeokit-sdk')`, create `Viewer({ canvasId })`,
  add `XKTLoaderPlugin`, fetch the `.xkt` `ArrayBuffer` (authed `downloadFile`),
  `xktLoader.load({ id, xkt: arrayBuffer })`, then fit the camera.
- Lifecycle: show a loading state during fetch+parse; on `unmount`/close
  **destroy the `Viewer`** and free the WebGL context + any object URLs.
- Errors: missing/corrupt XKT or WebGL-unavailable → graceful "couldn't load 3D
  preview" with a download-original fallback (never throw into the app shell).

### 5.1 Overlay — maximal, viewport-first

**`components/ModelViewerOverlay.vue`** is a **maximal full-screen overlay**, not a
constrained drawer/modal. The whole point is unrestricted 3D navigation, so:

- It fills the viewport (effectively full-bleed — full width/height, fixed
  position above the app shell; an `Esc`/close button and an optional small title
  bar are the only chrome). It does **not** reuse the narrow `FileDetailsDrawer`
  width or the centered-modal sizing used elsewhere.
- The **3D canvas always takes all remaining space** after the (collapsible)
  sidebar. Mouse/touch orbit-pan-zoom must own the canvas region with no
  scroll-jacking or padding eating into it.
- On open it locks body scroll; on close it restores and disposes the viewer
  (§5). Resize-aware: the canvas tracks the overlay size (and the sidebar
  collapse/expand, §5.2) via the viewer's resize handling.

### 5.2 Advanced features — collapsible sidebar

The advanced/inspection features live in a **collapsible sidebar** inside the
overlay (not floating panels over the canvas), so they can be tucked away for an
unobstructed, full-overlay viewport:

- **Sidebar contents:** the **object tree** (`TreeViewPlugin` — XKT already embeds
  the object/IFC-type hierarchy; supports expand, isolate, show/hide, fly-to), and
  a selected-object **properties/metadata** panel. Room to grow (layers, classes).
- **Collapse/expand:** a persistent toggle (and a keyboard shortcut) collapses the
  sidebar to a thin rail (or fully hidden), giving the canvas the **entire**
  overlay. State persists across opens (localStorage). Default: **collapsed on
  small screens**, expanded on wide.
- **On toggle, resize the canvas** so xeokit recomputes the viewport (the WebGL
  canvas must grow/shrink to the new free space — call the viewer's resize after
  the layout transition).
- **NavCube** (`NavCubePlugin`) is a small in-canvas widget (corner overlay), not
  part of the sidebar, so orientation control stays available even when the
  sidebar is collapsed.

## 6. Workstream B — icons & entry points (frontend-owned visuals)

- **Format-specific icons.** Add static 3D icon assets and map them via
  `modelFormat()` for file tiles in `FileBrowserView.vue` / `FileThumbnail.vue`
  (3D files have no raster thumbnail, so the icon is the tile).
- **Clicking a 3D file opens the details drawer** (like any file) — it does **not**
  jump straight into the viewer. The drawer is the entry point.
- **Details drawer "View model in 3D" link.** In `FileDetailsDrawer.vue`, when the
  file is a 3D model with a `model` rendition, the Info pane shows a prominent
  **"View model in 3D"** button (replacing the document preview, which is
  meaningless for a model) that opens the maximal `ModelViewerOverlay`. The drawer
  is too narrow for real navigation, so it launches the overlay rather than
  embedding a cramped canvas.
- **Kebab shortcut.** `KebabMenu.vue` also offers a "View in 3D" item as a direct
  shortcut for model files.
- **Preview route.** `/preview/:uid` opens the maximal overlay directly for
  `model` files (else the existing document/image/video preview).

## 7. Phases

- **P1 — vocabulary + plumbing (no UI risk).** Extend `renditions.ts` (`model`
  fmt + `modelRendition`), add `modelFormat()` util, fetch `.xkt` as
  `ArrayBuffer`. Unit-test name parsing, set reduction, and format mapping. No
  xeokit yet.
- **P2 — viewer + maximal overlay.** Add `@xeokit/xeokit-sdk` (lazy), build
  `Model3DViewer.vue` + the full-screen `ModelViewerOverlay.vue` (§5.1), load XKT,
  add the **NavCube overlay**, dispose cleanly. Component tests with xeokit
  dynamically mocked (assert load gets the fetched buffer; viewer destroyed on
  unmount; overlay is full-bleed / body-scroll locked).
- **P3 — collapsible sidebar + entry points.** Object-tree (`TreeViewPlugin`) +
  metadata sidebar with collapse/expand and **canvas resize on toggle** (§5.2);
  format icons, drawer "View model in 3D" link, KebabMenu action, drawer launch
  tab, `/preview/:uid` wiring. AGPL source/attribution link.
- **P4 — polish (deferred).** Camera presets, section planes, point-cloud display
  tuning, extra sidebar tabs (layers/classes), and (if/when the backend ships
  them) static raster thumbnails from the bespoke 3D preview service
  (`XEOKIT3D_PLUGIN.md` §13).

## 8. Testing

- **Unit (vitest):** `renditions.ts` (`model` fmt parsing + reduction),
  `modelFormat()` mapping across IFC/glTF/CityJSON/LAS/STL/PLY.
- **Component (vitest + @vue/test-utils):** `Model3DViewer.vue` with
  `@xeokit/xeokit-sdk` mocked — asserts lazy import, `XKTLoaderPlugin.load`
  receives the fetched `ArrayBuffer`, loading/error states render, and the
  `Viewer` is destroyed on unmount (no leaked WebGL contexts). `ModelViewerOverlay`
  — asserts it mounts full-bleed + locks body scroll, the **sidebar
  collapse/expand toggles and triggers a canvas resize**, and the NavCube widget
  is present. Keep real xeokit out of the unit suite (heavy, WebGL).
- **E2E (`e2e/`):** extend the existing script to upload a small model fixture and
  assert the `<version>-model.xkt` rendition appears (drive-by; geometry render
  itself is validated in the CSAI repo).

## 9. Config & deployment

- `.env`: no new variables — the `.xkt` is fetched through the existing
  `VITE_API_BASE` path. (`VITE_CSAI_BASE` already covers search/chat over the same
  model's indexed text.)
- `docker_unified`: the SPA build picks up `@xeokit/xeokit-sdk` automatically; the
  conversion side (Node + convert2xkt, optional IfcOpenShell) is wired in the CSAI
  image per `XEOKIT3D_PLUGIN.md` §9.

## 10. References

- Backend conversion + indexing: `convert_search_ai/design_documents/XEOKIT3D_PLUGIN.md`
- Broader SPA integration: [`SPA_INTEGRATION_PLAN.md`](./SPA_INTEGRATION_PLAN.md)
- xeokit-sdk (v2, AGPL): <https://github.com/xeokit/xeokit-sdk>
- XKTLoaderPlugin / XKT format: <https://xeokit.github.io/xeokit-sdk/docs/>
