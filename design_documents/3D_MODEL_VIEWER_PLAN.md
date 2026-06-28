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
- A read-only **inline 3D viewer** for files that have a `model` (`.xkt`)
  rendition, opened from the file browser / details drawer like the PDF preview.
- **Format-specific icons** (IFC / glTF / CityJSON / point cloud / mesh) and a
  **"3D preview" link/affordance** on file tiles — entirely frontend-owned (the
  backend ships no raster thumbnail for 3D in v1, by design).
- Object-tree / navigation niceties that come for free from the XKT metadata
  (tree view, nav cube) — optional, behind the viewer.

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

**`components/Model3DViewer.vue`** (and a thin `ModelViewerOverlay.vue` mirroring
`PdfPreviewOverlay.vue` for the full-screen affordance):

- Props: `fileUid` (source) and/or a resolved `RenditionRef` for the `.xkt` child.
- On mount: dynamic `import('@xeokit/xeokit-sdk')`, create `Viewer({ canvasId })`,
  add `XKTLoaderPlugin`, fetch the `.xkt` `ArrayBuffer` (authed `downloadFile`),
  `xktLoader.load({ id, xkt: arrayBuffer })`, then fit the camera.
- Lifecycle: show a loading state during fetch+parse; on `unmount`/close
  **destroy the `Viewer`** and free the WebGL context + any object URLs.
- Errors: missing/corrupt XKT or WebGL-unavailable → graceful "couldn't load 3D
  preview" with a download-original fallback (never throw into the app shell).
- Optional: `NavCubePlugin` + `TreeViewPlugin` (the XKT already embeds the
  object/IFC-type tree) behind a toggle.

## 6. Workstream B — icons & entry points (frontend-owned visuals)

- **Format-specific icons.** Add static 3D icon assets and map them via
  `modelFormat()` for file tiles in `FileBrowserView.vue` / `FileThumbnail.vue`
  (3D files have no raster thumbnail, so the icon is the tile).
- **"3D preview" affordance.** When a file has a `model` rendition, show a
  clickable 3D-preview badge/graphic (tile overlay + a "View in 3D" item in
  `KebabMenu.vue`) that opens `ModelViewerOverlay`.
- **Details drawer.** Add a "3D" tab to `FileDetailsDrawer.vue` (next to
  Preview/Versions/Access) that hosts `Model3DViewer` when a `model` rendition is
  present.
- **Preview route.** Extend `PreviewView.vue` (`/preview/:uid`) to render the 3D
  viewer when the file's rendition set contains `model` (else the existing
  document/image/video preview).

## 7. Phases

- **P1 — vocabulary + plumbing (no UI risk).** Extend `renditions.ts` (`model`
  fmt + `modelRendition`), add `modelFormat()` util, fetch `.xkt` as
  `ArrayBuffer`. Unit-test name parsing, set reduction, and format mapping. No
  xeokit yet.
- **P2 — viewer component.** Add `@xeokit/xeokit-sdk` (lazy), build
  `Model3DViewer.vue` + `ModelViewerOverlay.vue`, load XKT, dispose cleanly.
  Component tests with xeokit dynamically mocked (assert load is called with the
  fetched buffer and the viewer is destroyed on unmount).
- **P3 — entry points & icons.** Format icons, tile "3D preview" affordance,
  KebabMenu action, drawer "3D" tab, `/preview/:uid` wiring. AGPL source/
  attribution link.
- **P4 — polish (deferred).** NavCube/TreeView toggle, camera presets, point-cloud
  display tuning, and (if/when the backend ships them) static raster thumbnails
  from the bespoke 3D preview service (`XEOKIT3D_PLUGIN.md` §13).

## 8. Testing

- **Unit (vitest):** `renditions.ts` (`model` fmt parsing + reduction),
  `modelFormat()` mapping across IFC/glTF/CityJSON/LAS/STL/PLY.
- **Component (vitest + @vue/test-utils):** `Model3DViewer.vue` with
  `@xeokit/xeokit-sdk` mocked — asserts lazy import, `XKTLoaderPlugin.load`
  receives the fetched `ArrayBuffer`, loading/error states render, and the
  `Viewer` is destroyed on unmount (no leaked WebGL contexts). Keep real xeokit
  out of the unit suite (heavy, WebGL).
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
