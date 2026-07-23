# 3D Viewer — xeokit Upgrade, Markup Suite & BCF Integration Plan

**Status:** Draft
**Branch:** `feat/xeokit-upgrade-bcf-markup`
**Author:** (drafted with Claude Code)
**Date:** 2026-07-23

Extends `3D_MODEL_VIEWER_PLAN.md` (the baseline xeokit viewer) with an SDK upgrade
and four capabilities — **improved navigation, cut-away (section) tools,
measurement, and annotation** — where *annotation is a first-class anchored comment*,
not a parallel system. It then specifies **BCF** (BIM Collaboration Format) support:
`.bcfzip` file round-trip and a dedicated **BCF-API subservice** so external AEC tools
(Revit/Navisworks/Solibri/BIMcollab) collaborate live against FileEngine.

This operationalizes roadmap **Phase 7.2** (xeokit plugin suite + BCF export + BCF
REST API — "BCF is the wedge"), **Phase 8.1** (openBIM issue hub, BCF-REST-fronted),
and lands squarely on the **Phase 2** principle that the anchored-comment primitive is
the *single* versioned, deep-linkable entity all in-browser markup writes into. It also
cashes in **Phase 1.7** (shared OAuth 2.0 / OIDC) — which is exactly the auth a BCF-API
server must expose.

---

## 1. Motivation & scope

The viewer today can open and explore a model, but users can't *do* anything durable
with it: no cut-planes to see inside, no measuring, and no way to pin a comment to a
place in the model. In AEC that last one is the whole game — coordination is a stream
of "this clash / this RFI, at *this* element, seen from *this* view," and the industry
already has a lingua franca for it: **BCF**. Supporting BCF turns FileEngine from "a
place models live" into a node in the openBIM issue workflow every AEC tool speaks.

This is not a BIM-only effort. Mechanical CAD/CAM shares the same collaboration need
(review a part, mark up a clash, pin an issue to a feature or a tolerance), and the
emerging BIM collaboration standards generalize to it: a *viewpoint* (camera, section,
snapshot) round-trips for **any** 3D model; only BCF's IFC-component references are
BIM-native. So the scope is **all disciplines the platform ingests** — BIM (IFC), CAD/CAM
(STEP/IGES/BREP), plus glTF, meshes, point clouds, and CityJSON.

**In scope:** the xeokit upgrade; navigation, section, measurement, and annotation UX in
the SPA; the anchored-annotation ↔ comment integration; BCF-XML import/export; a new
BCF-API subservice; and — the load-bearing foundation (§5.2) — **preserving as much
internal metadata / object / region data as possible for every 3D format, BIM and CAD/CAM
alike**, so investigation, review, and annotation can reference real model objects. That
last item lives in the `convert_search_ai` conversion pipeline (cross-repo), tracked here
as a first-class foundation rather than an external prerequisite. **Out of scope:** the
PDF.js markup surface (roadmap 7.1 — it writes into the *same* anchor model designed here,
but its own UX is separate).

---

## 2. Current state (baseline)

From a source review of the three subsystems:

**xeokit / the viewer** (`src/components/Model3DViewer.vue`, `ModelViewerOverlay.vue`,
`src/services/renditions.ts`, `src/stores/model3d.ts`):
- Pinned to the **monolithic `@xeokit/xeokit-sdk@2.6.112`**, lazy-imported as one
  namespace when a model opens. Plugins used: `Viewer`, `XKTLoaderPlugin`,
  `TreeViewPlugin`. `NavCubePlugin` is **integrated but hard-disabled** (`NAVCUBE_ENABLED
  = false`) pending upstream bug #2016 (regressed 2.6.104, throws "Missing input
  materialEmissive," crashes the render loop).
- **No** `SectionPlanesPlugin`, `DistanceMeasurementsPlugin`, `AngleMeasurementsPlugin`,
  `AnnotationsPlugin`, or `BCFViewpointsPlugin` anywhere — nothing to build on.
- Camera uses the Viewer's **default `CameraControl`** — no `navMode` is ever set. The
  "Nav step" slider is a custom rate-scaling hack (scales dolly rates + monkey-patches
  `camera.pan`), not a xeokit feature. `resetCamera()` = `cameraFlight.flyTo(scene)`.
- The model loads from a pre-converted **`.xkt` `model` rendition** (a hidden child of
  the source file) fetched as an `ArrayBuffer`; **only the raw `.xkt` bytes** are passed
  to `XKTLoaderPlugin.load()` — *no* `metaModelData`/`metaModelSrc`.
- **No client-side object metadata — for *any* format.** `XEOKIT3D_PLUGIN.md` designs a
  metamodel-bearing pipeline, but it was **never built**: `convert2xkt` runs with no `-m`,
  so every delivered `.xkt` is **geometry-only**. All extracted metadata (IFC property
  text, STEP/IGES header strings, glTF names, CityJSON attributes, LAS header) feeds a
  **search-only** track (FTS/pgvector) and never reaches the viewer. The object tree thus
  populates only from whatever the converter happens to embed, and the viewer has **no
  stable per-object id for any format**. CAD is worse: the OCCT path reads STEP into an XDE
  document but `XGetOneShape` flattens the assembly and the default recenter discards the
  labels — part names, colors, layers, and **PMI/GD&T are dropped entirely**. Closing this
  is §5.2, the foundation the rest of the plan stands on.
- `model3d` store tracks just `{ uid, name }` — no viewer, selection, or rendition state.

**The comment / discussion system** (`src/services/discussionService.ts`; backend
`discussion_threaded_communication`):
- A `Thread` anchors to **`(file_uid, version)` only**. There is **no** region /
  coordinate / viewpoint / metadata / JSON column on `threads` or `comments` — the
  schema's only JSONB is an unrelated digest field.
- The spec (`SPECIFICATION.md §1`) and a load-bearing DDL comment
  (`schema.py:26-27`) **explicitly pre-designate the extension point**: a nullable
  `region`/anchor **JSONB** column on `threads`, "service-side metadata interpreted by
  the frontend viewers (PDF preview, xeokit BIM viewer) — the core stays unaware,"
  added additively when V2 lands. *This plan is that V2.*
- Threads are unpinned in practice (the SPA sends no `version`); `anchor_stale` flips on
  supersession. Reviews (`review_requests`), nested comment replies, resolve/reopen,
  mentions, and a live WebSocket layer all exist.
- Store writes go through `create_thread`, which persists only
  `id/file_uid/version/title/opened_by` and **silently drops unknown body keys** — so a
  new anchor field must be wired through `create_thread`, `_THREAD_COLS`, the `toThread`
  mapper, and (if it should sync) the event/live payloads.

**BCF today:** none. But identity does exist — **Phase 1.7 shipped an OAuth 2.0 / OIDC
authorization server** (`ldap_manager`), which is precisely what a BCF-API `/auth`
discovery endpoint must point at.

---

## 3. Guiding principles

1. **One annotation substrate.** A 3D annotation *is* an anchored comment thread — same
   entity as a PDF markup and a plain comment, differing only by its `anchor`. We extend
   the discussion model; we do not build a second store. (Phase 2 principle, verbatim.)
2. **The viewpoint is the atom.** A saved camera + visibility + selection + section
   planes + snapshot is one object that serves three masters at once: the annotation's
   restore-state, the **BCF viewpoint**, and AI-queryable structured data. Model it once,
   in a BCF-2.1-shaped JSON, and everything downstream is projection.
3. **The SPA stays a pure client.** The viewer captures viewpoints and snapshots
   client-side (xeokit does this for free); it never converts models or renders headless.
4. **Reuse the shipped identity layer.** The BCF-API server authenticates via Phase
   1.7's OAuth server — no new auth stack. This is the payoff that makes BCF-API cheap.
5. **BCF 2.1 is the interop target; 3.0 is forward-compat.** 2.1 is what desktop BCF
   Managers round-trip reliably today; keep the internal model 3.0-capable behind a
   serialization switch.
6. **Standards live at the edge, not the core.** BCF's protocol/format surface (versioned
   paths, OData filters, XML zip, extensions vocab, round-trip GUID identity) is isolated
   in a **dedicated subservice** so the discussion service stays a clean, viewer-agnostic
   comment store. "Many doors, one core," now with a BCF door.
7. **Preserve everything the source knows.** The conversion pipeline extracts the model's
   objects, hierarchy, properties, and — for CAD/CAM — assembly structure and PMI/GD&T, and
   *delivers* them to the client as a metamodel (§5.2), not just to the search index. The
   metamodel is the shared substrate for the object tree, property inspection, review,
   measurement-by-part, search, AI reasoning, **and** annotation anchoring; build it once
   per format and everything downstream inherits it. Metadata is expensive to recover and
   cheap to keep — never discard it in conversion.
8. **Collaboration is discipline-neutral.** The viewpoint/annotation/issue model is not
   BIM-specific. A saved view + markup + thread works for a mechanical assembly, a point
   cloud, or a city model as readily as a building. BCF is the *interop wire format* (and
   its component refs are IFC-native), but the internal model references objects by each
   format's own identity (§4 `object_refs`, §5.2), so CAD/CAM is a first-class citizen, not
   a bolt-on.

---

## 4. The central data structure — the *viewpoint anchor*

Everything hinges on one shape. We add a single discriminated-union **`anchor` JSONB**
to `threads` (the pre-designated column). The `kind` selects the interpretation; the
frontend viewer for that kind renders/restores it; the core stays unaware.

```jsonc
// threads.anchor  (nullable JSONB; null = a plain file-level comment, unchanged behaviour)
{
  "kind": "model-viewpoint",          // | "pdf-region" (Phase 7.1) | future kinds
  "schema": "fileengine.anchor.v1",
  "viewpoint": { /* BCF-2.1 viewpoint JSON — see below */ },
  "marker": { "x": 0, "y": 0, "z": 0 },   // optional world-space pin for the 3D badge
  "object_refs": [                         // source-tagged element refs (query/BCF/AI), §5.2
    { "source": "ifc", "id": "3xY...22char", "ifc_guid": "3xY...22char" }
    // | {"source":"step","id":"<ocaf-label>"} | {"source":"gltf","id":"<node>"}
    // | {"source":"pointcloud","id":"<class/segment>"} | …
  ],
  "snapshot_rendition_uid": "…"            // hidden-child PNG (the view thumbnail)
}
```

The `viewpoint` sub-object is **exactly what xeokit `BCFViewpointsPlugin.getViewpoint()`
emits** (BCF-API JSON form): `perspective_camera` **or** `orthogonal_camera`
(`camera_view_point`, `camera_direction`, `camera_up_vector`, `field_of_view` /
`view_to_world_scale`), `selection[]`, `visibility` (`default_visibility` + `exceptions[]`),
`clipping_planes[]` (`location`+`direction`, from `SectionPlanesPlugin`), optional
`lines[]`/`bitmaps[]`, and `snapshot` (`snapshot_type` + base64). Because the xeokit entity
ids **are the metamodel's per-object ids** (§5.2 — IFC GlobalId for BIM; the OCAF label /
glTF node / point-cloud segment id for other disciplines), `setViewpoint()` restores the
exact object visibility/selection with no mapping. `object_refs` is the format-neutral
denormalization; the IFC case additionally fills `ifc_guid` so it round-trips as a native
**BCF component** (§10), while CAD/mesh/point-cloud refs anchor annotations and drive review
fully and degrade BCF-component round-trip gracefully.

This makes the annotation↔BCF conversion **near-identity**: the anchor's `viewpoint`
serializes straight to a BCF `.bcfv` / BCF-API viewpoint, and vice-versa. It also gives
the AI (MCP) a structured, queryable "what does this issue point at" without bespoke work.

---

## 5. Prerequisite foundations (Phase 0)

These gate the four workstreams and are done first.

### 5.1 xeokit SDK upgrade
- **Bump `@xeokit/xeokit-sdk` to the current latest of the monolithic line** (the project
  pins `2.6.112`; confirm the newest `2.6.x` at implementation time — the sandbox mirror
  is version-capped, so check npm directly). Rationale: (a) clear the **NavCube #2016**
  regression (verify it's fixed in the target release before re-enabling); (b) every
  plugin this plan needs — `SectionPlanesPlugin`, `DistanceMeasurementsPlugin`,
  `AngleMeasurementsPlugin`, `AnnotationsPlugin`, `BCFViewpointsPlugin`, `StoreyViewsPlugin`
  — ships in the monolithic SDK and is mature there.
- **Stay on the monolithic package for this work.** The next-gen scoped `@xeokit/*` SDK
  is a ground-up rewrite with a different API and less-complete plugin parity; migrating
  is a separate, deferrable decision, not a prerequisite for markup/BCF. Note it as a
  future track; do not couple this work to it.
- **Migration risk is low but real:** we lazy-import the whole namespace as `any`, so a
  minor bump is mostly "verify the four plugins construct and the existing viewer test
  still passes." Pin an exact version (drop the `^`) and add a smoke test that
  instantiates each plugin.

### 5.2 Metadata & object preservation across **all** 3D formats — the conversion foundation (cross-repo, `convert_search_ai`)
This is the load-bearing foundation, and it is bigger than "IFC GlobalId." Every
investigation, review, and annotation feature in this plan needs the viewer to see the
model's **objects** — not just its triangles.

**Current reality (from a pipeline review).** `XEOKIT3D_PLUGIN.md` *designs* a
metadata-rich pipeline (a xeokit **metamodel** passed to `convert2xkt -m`), but **none of
it is built.** The shipped `xeokit3d.py` calls `convert2xkt -s <in> -o <out>` with no `-m`
for every format, so **every delivered `.xkt` is geometry-only.** All the metadata that is
extracted is on a *separate search track* (text → FTS/pgvector) that never reaches the
client, and the viewer today loads only raw `.xkt` bytes with **no `metaModelData`**. Net:
the viewer has **no stable per-object identifier for any format** — the identity exists
upstream and is dropped before the client. CAD is worse than IFC: the OCCT path reads a STEP
into an XDE document but then `XGetOneShape` **flattens the assembly** and the default
recenter re-wraps it in a fresh doc, **discarding part names, colors, layers, and PMI/GD&T
entirely.**

**Goal.** Deliver, alongside each model, a **xeokit metamodel** — MetaObjects carrying a
stable `id`, `type`, `name`, `parent` (hierarchy), and `propertySets` — for **BIM and
CAD/CAM and the rest**, so the viewer (and search, and the AI) can name, tree, inspect,
select, measure-by-part, and **anchor annotations to** real objects. This is a discipline-
neutral capability: BIM gets IFC semantics; mechanical CAD gets assembly structure + PMI;
every format contributes what it knows.

**Delivery mechanism (one seam).** Generate a `metamodel.json` and either pass it via
`convert2xkt -m` (the single call site `_convert2xkt_at`) **or** ship it as a new sidecar
**`metamodel` rendition** (a hidden child) that the viewer loads via
`XKTLoaderPlugin.load({ xkt, metaModelData })`. Add `metamodel` to the frontend rendition
vocabulary (`renditions.ts`) and wire `Model3DViewer` to fetch + pass it. Prefer the sidecar
so the metamodel can be re-generated/enriched without re-tessellating geometry.

**What to preserve, per format** (source of the object id in **bold**):

| Format | Preserve into the metamodel | Object identity | Tool |
|---|---|---|---|
| **IFC (BIM)** | **GlobalId**, IfcType, Name/Description, property & quantity sets, spatial tree (Site→Building→Storey→Space), materials, classification | **IFC GlobalId** (22-char) | `ifcopenshell` — *already opened* for the search track (`_ifc_text_ifcopenshell`); emit the metamodel in the same pass |
| **STEP / IGES (CAD/CAM)** | assembly/product tree, part & product names, colors, layers, and **PMI / GD&T** (tolerances, datums, annotations — STEP **AP242**) | **persistent OCAF label** (XDE) | OCCT **XDE** — `XCAFDoc_ShapeTool` (assembly), `ColorTool`, `LayerTool`, `DimTolTool`/AP242 semantic PMI. **New export code required**; stop `XGetOneShape` flattening + label-discarding recenter |
| **glTF / GLB** | node/mesh names, `extras`, KHR extension metadata, scene graph | **node index / name** | parse glTF JSON (the `extract_gltf_text` parser already reads these) |
| **CityJSON** | CityObject id, type, attributes, semantic surfaces, LoD | **CityObject id** | parse CityJSON (parser already present) |
| **Point clouds (LAS/LAZ)** | classification codes → **segments/regions**, intensity, RGB, header/CRS | **class/segment id** | LAS reader; a segment is the point-cloud analogue of an "object" |
| **Meshes (OBJ/PLY/STL/WRL)** | group/object names, materials | **group/`o` name** (OBJ); often absent (bare STL) | mesh parsers (already harvest these as text) |

**Generalized object identity → the anchor.** Because identity is now per-format, the
annotation anchor references objects with a **source-tagged ref**, not IFC-only (see §4's
`object_refs`). IFC GlobalId is the one that also round-trips as a **BCF component**; the
others anchor annotations and drive investigation/review fully, and degrade BCF component
round-trip gracefully (the viewpoint camera/section/snapshot still round-trips for any model
— §10, §16).

**Why it's the foundation (the investigation & review payoff).** The metamodel is what powers
the object **tree**, property **inspection**, **PMI/GD&T** display for mechanical review,
**assembly navigation**, measurements labeled by part, cross-format **search** and **AI**
reasoning ("which parts exceed tolerance," "show every wall of type X"), *and* annotation
anchoring. Without it the viewer is a picture; with it, it's a queryable model.

**Sequencing within this foundation** (cheapest, highest-value first): **IFC** metamodel
(ifcopenshell is already loaded — low effort, immediate) → **glTF / CityJSON** (straight JSON
parse) → **CAD via OCCT XDE** including PMI/GD&T (the biggest lift; new XCAF-walking export
code) → **point-cloud segmentation** (opportunistic). The viewer/annotation work can begin
against camera/section-only viewpoints and light up element-level fidelity per format as each
metamodel lands.

### 5.3 Viewer refactor — a plugin host with an imperative API
`Model3DViewer.vue` becomes a **plugin host** that owns the `Viewer` + all plugins and
exposes a typed imperative API via `defineExpose`, e.g. `getViewpoint()`, `setViewpoint(v)`,
`captureSnapshot()`, `addSectionPlane()`, `startMeasurement(kind)`, `setNavMode(mode)`,
`highlightObjects([...])`. The `model3d` store grows to hold **live viewer state**
(active tool, section planes, current selection) so the overlay toolbar and the annotation
layer can drive and reflect it. Keep the lazy-import + overlay-resize discipline intact.

### 5.4 Discussion: the `anchor` JSONB column (additive)
Land the **pre-designed schema addition** in `discussion_threaded_communication`:
`ALTER TABLE threads ADD COLUMN anchor JSONB` (nullable), wired through `create_thread`,
`_THREAD_COLS`, the `toThread`/`toComment` mappers, `discussionService`, and — so 3D
markers sync live — the event envelope + live payload (add an optional `anchor` slot).
Null anchor = today's file-level comment, unchanged. Also add `comments.viewpoint_ref`
(nullable) so a comment can pin to one of a topic's viewpoints (BCF semantics). This is
the *only* change the comment substrate needs for annotations; BCF-specific fields live in
the subservice (§13), not here.

---

## 6. Workstream A — Improved navigation

Small, high-satisfaction, no data model. All `CameraControl` / camera work.

- **Set explicit nav modes.** Expose orbit / first-person / plan (`cameraControl.navMode
  = "orbit" | "firstPerson" | "planView"`) with a toolbar toggle; default orbit. Enable
  `followPointer` and `smartPivot` so orbiting pivots about the point under the cursor
  (the single biggest feel improvement).
- **Replace the "Nav step" hack** with xeokit-native rate config where possible
  (`dollyMinSpeed`, `panRightClick`, `keyboard*Rate`), keeping a single "speed" slider;
  retire the `camera.pan` monkey-patch if the SDK now exposes a pan rate.
- **Re-enable the nav cube** *iff* #2016 is fixed in the target release (§5.1); otherwise
  keep disabled and ship a lightweight home/axis widget.
- **Standard view shortcuts** (top/front/iso/fit) and **fit-to-selection**. These double
  as the seeds of saved viewpoints.
- **`StoreyViewsPlugin`** (opportunistic) for IFC building storeys — a plan-view-per-level
  picker; depends on §5.2 metadata.

## 7. Workstream B — Cut-away / section tools

The `SectionPlanesPlugin`. Must precede annotation (a viewpoint *includes* its clipping
planes) and BCF (clipping planes are a first-class viewpoint field).

- **Interactive section planes:** click a surface to drop a plane, drag the control to
  slide/rotate, toggle flip, and add up to N planes. Provide axis-aligned quick-cuts
  (X/Y/Z) and a "section box" (6 planes) for isolating a region.
- **State in the store** so viewpoints capture the exact planes and annotations restore
  them. Each plane is `{ location, direction }` — the **direct BCF `ClippingPlane` map**.
- Clear-all + per-plane visibility. Persist last-used behavior locally like Nav step.

## 8. Workstream C — Measurement

Read-only spatial queries; independent of the data model.

- **`DistanceMeasurementsPlugin`** (point-to-point: axis components + straight-line) and
  **`AngleMeasurementsPlugin`**. Snap to vertices/edges via the plugins' snapping.
- **Units** come from the model (§5.2 metadata) — display in model units with a
  mm/m/ft switch; **note the BCF meters caveat** (§17) for anything exported.
- Measurements are **transient by default** (a viewer tool, not stored), but a measurement
  can be **promoted into an annotation** (it becomes `lines[]` on the viewpoint) so it
  persists and round-trips as BCF markup. This is the bridge from Workstream C to D.

## 9. Workstream D — Annotation ↔ comments (the integration)

The crux. An annotation is a comment thread whose `anchor.kind = "model-viewpoint"`.

**Creating an annotation** (in the viewer):
1. User frames a view, optionally cuts/selects/measures, clicks **"Comment here"** (or
   drops a marker at a picked point).
2. The viewer calls `getViewpoint()` (camera + visibility + selection + clipping + optional
   lines) and `captureSnapshot()` (canvas PNG).
3. The SPA **opens a thread** on the model's `file_uid` with `anchor = { kind:
   "model-viewpoint", viewpoint, marker, object_refs, snapshot_rendition_uid }`, reusing
   `discussionService.openThread` (extended in §5.4). The snapshot is saved as a
   hidden-child rendition of the file. The first comment is the annotation body.
4. **The comment area updates immediately.** Creating an annotation is creating a
   comment, so the `ThreadPanel` refreshes to show it — driven by the discussion **live
   layer** (§5.4 adds `anchor` to the live payload), so an annotation raised in the
   viewer surfaces in the open comment panel (and every teammate's) in real time, no
   manual reload. The viewer signals the panel through the same store/live path the
   comment UI already listens on.

**Annotation-generated comments deep-link back to the model — as a fully restorable
view, not just a jump.** Every annotation comment carries a **deep link into the model**
that restores the annotation's **complete saved navigation state** — camera pose,
**section / slice planes**, per-object visibility, and selection — by replaying the
anchor's `viewpoint` through `setViewpoint()`, *and* centers/highlights the referenced
object(s) (`highlightObjects`, §5.3). Clicking it:
- opens the model in the 3D viewer (if not already open) for the comment's `file_uid`;
- **restores the full viewpoint** — the exact camera *and every cut-plane the author had
  active* *and* the visibility/selection state — so you see the model the way the author
  framed it, slices and all; and
- **centers on and highlights** the specific referenced object within that restored view.

That restore of the *whole* view state — cut-planes included — is the point of pinning an
issue to a viewpoint: a reviewer opens the comment and is looking at exactly what the
author was looking at. The on-model **marker** and the in-panel comment link **resolve to
the same restore** (`setViewpoint()`); the marker is the in-viewport affordance, the
comment link the in-panel one. The link reuses the discussion deep-link routing
(`/preview/{uid}?thread=…`), extended with **`&view={anchorThreadId}`** (restore the full
viewpoint) and optional **`&object={id}`** (which element to center/highlight within it),
so it's shareable and survives reload — the same "open the file and take me to the relevant
spot" pattern the SPA uses for threads, now restoring a **full navigation state** *inside*
the model. (This is exactly the state BCF viewpoints carry, so it round-trips as BCF and
back — §10, §11.)

**Rendering annotations** (in the viewer):
- Threads with a `model-viewpoint` anchor render as **markers** (via `AnnotationsPlugin`
  or lightweight DOM badges positioned from `marker`/camera). Clicking a marker
  `setViewpoint()`s the saved view **and** opens `ThreadPanel` focused on that thread —
  the discussion panel already docks beside the viewer today, so this is wiring, not new
  chrome. A "restore view" affordance re-applies the viewpoint without opening the panel.
- The **object tree / selection** cross-highlights: selecting an element filters to
  annotations whose `object_refs` include it.

**Lifecycle & versioning:**
- Annotations inherit the thread's `(file_uid, version)` binding, `anchor_stale` on model
  supersession (the marker shows a "stale" state — the model changed under the view), and
  resolve/reopen + review requests **for free**. A resolved annotation is a closed issue.
- Live sync: because §5.4 adds `anchor` to the live payload, a teammate's new annotation
  marker appears in your open viewer in real time (bounded to the file, per the existing
  live model).

**Why this is the whole point:** annotations get permissions, versioning, @mentions,
reviews, resolution, live sync, AI-retrievability, and deep-linking **for free**, because
they *are* comments. And a `model-viewpoint` anchor is already 90% of a BCF topic — which
makes §12–13 mostly serialization.

---

## 10. BCF — the mapping (condensed brief)

BCF is two coupled specs: **BCF-XML** (a `.bcfzip` file, async "email the issue" exchange)
and **BCF-API** (a REST server for live tools). Entity hierarchy: **Project → Topic (the
issue) → { Comments (flat list), Viewpoints, DocumentReferences }**; the Viewpoint carries
the 3D state. Target **2.1** for interop, keep **3.0** reachable.

**FileEngine ↔ BCF mapping** (the heart of the subservice):

| BCF entity | FileEngine representation |
|---|---|
| **Project** | a **FileEngine folder** — all models in the folder *are* the project's models (`bcf_project` maps `project_id` → the folder uid) + an **extensions** vocabulary (types/statuses/priorities/labels/stages). A topic's Header/Files can reference any model in the folder. |
| **Topic** (issue) | a discussion **thread** + a **BCF issue facet** (`bcf_topic`: `topic_type`, `topic_status`, `priority`, `assigned_to`, `labels[]`, `due_date`, `stage`, `bcf_guid`, `server_assigned_id`) keyed by `thread_id` |
| **Comment** | a discussion **comment** (BCF is a flat list → **flatten** nested replies on export, §17) |
| **Viewpoint** | the thread `anchor.viewpoint` (+ a `bcf_viewpoint` table for a topic's *additional* viewpoints); `comments.viewpoint_ref` pins a comment to one |
| **Snapshot** | the `snapshot_rendition_uid` PNG (client-captured by `getViewpoint`) |
| **Component.IfcGuid** | for IFC: xeokit entity id = **IFC GlobalId** (needs §5.2), from `anchor.object_refs`. For CAD/mesh/point-cloud: no IFC GlobalId exists, so component-level BCF is **best-effort** (map to the format's object id where a strict tool tolerates it, else omit) — the **camera + section + snapshot always round-trip**, which is most of a viewpoint's value cross-discipline |
| **ClippingPlane** | a `SectionPlanesPlugin` plane (`location`+`direction`) — identity map |
| **Header/Files** | the thread's `file_uid` → the IFC source file (+ its IFC project GUID) |
| **Auth** | **Phase 1.7 OAuth** (`ldap_manager`) — `/auth` discovery points here |

A thread becomes a "BCF topic" precisely when it's given the issue facet — via the viewer's
"raise as issue" action or via the BCF service. **Every BCF topic is a comment thread; not
every comment thread is a BCF topic.**

## 11. Workstream E — BCF-XML import/export (`.bcfzip`)

Do this **before** the live API — lower effort, higher tool compatibility, immediate value.

- **Export** a selected issue set to a **BCF 2.1** `.bcfzip`: `bcf.version`, optional
  `project.bcfp`, one `{topic-guid}/` folder each with `markup.bcf` (Topic + flat Comments
  + Viewpoints index + Header/Files referencing the IFC model), a `.bcfv` per viewpoint
  (serialize `anchor.viewpoint`), and `snapshot.png`. **Preserve `bcf_guid`** for round-trip
  identity.
- **Import**: unzip, branch on `bcf.version` (2.x vs 3.0), map each Topic→thread(+facet),
  Comments→comments, `.bcfv`→`anchor.viewpoint`, snapshot→rendition; upsert by `bcf_guid`
  so re-imports update rather than duplicate.
- Ship as an endpoint on the subservice (`POST /bcf-xml/import`, `GET …/export?topics=…`)
  and a SPA "Import/Export BCF" action in the viewer/issue list.

## 12. Workstream F — the BCF-API subservice

**A new microservice (`bcf_service`)** — the "another subservice specifically for BCF"
the brief calls for. It is the **BCF protocol/format door**, an adapter over the discussion
store + core file store; it is *not* a second issue database.

**Why a separate service (not folded into discussion or http_bridge):**
- The BCF surface is **large, standards-driven, and externally-facing** (versioned
  `/bcf/{version}/…` paths, OAuth2 discovery, OData `$filter/$top/$skip`, XML-zip handling,
  extensions vocab, foundational-vs-extended tiers). Isolating it keeps the discussion
  service a clean, viewer-agnostic comment store.
- It's an **integration edge** with its own auth/threat/rate-limit surface (desktop tools
  connect with long-lived OAuth sessions) — good to sandbox and scale independently.
- It matches the platform's "many doors, one core" shape (like `webdav_bridge`,
  `http_bridge`, the MCP doors): one more door over the same governed data.

**Data ownership (the clean seam) — a shared storage interface, not cross-service REST.**
The comment/thread storage is factored into a **shared Python library** (a
`comment_store` interface package) that *both* the discussion service and `bcf_service`
import — so BCF topic/comment writes go through the **same storage interface** the
discussion service uses, not over an HTTP hop between the two services. One code path owns
the invariants (ACL checks, `body_text`/FTS, mention extraction, event emission), used by
both doors.
- **Discussion service** owns the substrate tables and remains the reference consumer of
  the shared interface: `threads` (+ `anchor`), `comments` (+ `viewpoint_ref`).
- **`bcf_service`** imports the same interface to read/write threads + comments, and owns
  the BCF projection tables in the **same per-tenant schema**: `bcf_project` (project↔folder
  + extensions vocab), `bcf_topic` (the issue facet, keyed by `thread_id`), `bcf_viewpoint`
  (a topic's extra viewpoints + snapshot refs), and a `bcf_guid ↔ thread_id` identity map.
- **One writer of the invariants, two doors.** Because both services call the shared
  interface (which emits the same discussion events), a BCF-API write lands as a normal
  comment/thread — so it **fans out over the live layer to the SPA comment panels and 3D
  markers just like an in-app annotation** (this is what lets an issue synced from Solibri
  appear live in a teammate's viewer). No dual-writer races: the interface is the single
  guardian of the write rules; the tables have one owning schema.

**Endpoints — foundational set first** (the minimum a BCF Manager needs to log in and sync):
- `GET /bcf/versions`; `GET /bcf/{v}/auth` → advertise the **Phase 1.7** `oauth2_auth_url` /
  `oauth2_token_url` + `authorization_code_grant`; `GET /bcf/{v}/current-user`.
- `GET /projects`, `GET /projects/{id}`, `GET /projects/{id}/extensions` (types / statuses /
  priorities / labels / stages / users / authorizations — **must be populated or tools show
  empty dropdowns**).
- `GET|POST /projects/{id}/topics`, `GET|PUT|DELETE …/topics/{guid}`.
- `GET|POST …/topics/{guid}/comments`, `GET|PUT|DELETE …/comments/{cguid}`.
- `GET|POST …/topics/{guid}/viewpoints`, `GET|DELETE …/viewpoints/{guid}`,
  `GET …/viewpoints/{guid}/snapshot` (binary PNG). Snapshot is **base64 on POST, binary on
  GET**.

**Extended endpoints — add as demanded:** `document_references`, `related_topics`, topic/
comment `events` (audit — maps to the existing discussion/audit trails), and the
`selection` / `coloring` / `visibility` viewpoint sub-resources.

**Auth:** OAuth2 via `ldap_manager` (Phase 1.7). BCF-API `/auth` discovery returns those
URLs; the service verifies Bearer tokens with the shared JWKS and acts under the token's
identity — so every BCF read/write runs through FileEngine's **impersonation rule** and
appears in the audit log, same as every other door. Support token refresh (sync sessions
are long-lived). HTTPS-only (enforced at the edge proxy already).

**BCF 3.0 / OpenCDE Foundation API:** structure the version prefix so a `/bcf/3.0/` tier
can layer on the Foundation API later; keep `bcf_topic` fields 3.0-capable
(`server_assigned_id`, central documents) behind the serializer.

---

## 13. Data model changes (summary)

| Where | Change | Notes |
|---|---|---|
| `discussion` `threads` | **`anchor JSONB` (nullable)** | the pre-designed V2 column; wire through store/mapper/events/live |
| `discussion` `comments` | `viewpoint_ref` (nullable) | pin a comment to a viewpoint (BCF) |
| `discussion` service/API | thread create/read carries `anchor`; live payload gains an `anchor` slot | additive; null = today's behavior |
| **shared `comment_store` lib** | extract the comment/thread storage interface both `discussion` and `bcf_service` import | one guarded write path; §12 |
| `bcf_service` | `bcf_project`, `bcf_topic` (issue facet), `bcf_viewpoint`, `bcf_guid↔thread_id` map | new per-tenant tables; BCF-only |
| renditions | `snapshot` (PNG) as a hidden child of the model file | client-captured; reused as BCF snapshot |
| `model3d` store (SPA) | live viewer state (tool, section planes, selection, viewpoint) | drives toolbar + annotation layer |
| SPA routing | extend the discussion deep-link to restore a model view (`?thread=…&view={anchorThreadId}&object={id}`) | opens viewer, **restores the full viewpoint (camera + slice planes + visibility)**, then centers/highlights the element; §9 |
| XKT pipeline (backend) | preserve IFC GlobalId as entity id / emit metamodel JSON | §5.2 prerequisite, cross-repo |

Every discussion change is **additive and nullable** — no migration of existing threads.

---

## 14. Sequencing & phases

Dependency-ordered. Each phase is independently shippable.

1. **Phase 0 — Foundations (§5).** xeokit bump + plugin smoke test; viewer plugin-host
   refactor + imperative API; `anchor JSONB` in discussion.
2. **Phase M — Metadata foundation (§5.2), runs in parallel as a track of its own** (it's
   the biggest backend lift and gates *object-level* fidelity, not camera/section, so it
   need not block the viewer phases). Internal order, cheapest-first: **M1 IFC metamodel**
   (ifcopenshell already loaded) → **M2 glTF + CityJSON** (JSON parse) → **M3 CAD via OCCT
   XDE** incl. assembly + colors/layers + **PMI/GD&T** (new XCAF-export code — the big one)
   → **M4 point-cloud segmentation** (opportunistic). Ship the `metamodel` rendition +
   viewer `metaModelData` wiring with M1 so each later format lights up as it lands.
3. **Phase A — Navigation (§6).** Pure viewer; ship first for immediate feel win.
4. **Phase B — Section planes (§7).** Precedes annotation & BCF (clipping ∈ viewpoint).
5. **Phase C — Measurement (§8).** Parallel to B; **richer once M-track lands** (label
   measurements by part; snap to metamodel objects).
6. **Phase D — Annotation ↔ comments (§9).** Needs Phase 0 (anchor) + B (clipping). Works
   with camera/section-only viewpoints immediately; **object_refs fidelity per format
   follows the M-track**. The headline feature; standalone value before any BCF.
7. **Phase E — BCF-XML round-trip (§11).** Needs D (viewpoints) + M1 (IFC ids for
   components). Async interop win; validate against a real Solibri/BIMcollab `.bcfzip`.
8. **Phase F — BCF-API subservice (§12).** Needs E (serialization) + Phase 1.7 OAuth. The
   live-collaboration door; roadmap Phase 8.1's openBIM issue hub.

Rationale: the **metadata foundation (M)** is the long pole and runs alongside everything —
viewer features (A–C) are low-risk crowd-pleasers that *produce* the viewpoint primitive and
don't wait on it; annotation (D) turns that primitive into governed issues via the existing
comment substrate (camera/section first, object-level as each metamodel lands); BCF file (E)
then API (F) project those issues outward — file first because it's the higher-compatibility,
lower-effort proof, API second for live tool connection. CAD/CAM object fidelity (M3) is the
one deep item and is deliberately not on the critical path to first value.

---

## 15. Testing

- **Viewer:** extend the existing `Model3DViewer` test (which mocks `Viewer`/`XKTLoader`/
  `TreeView`) to construct each new plugin; add a `getViewpoint()`→`setViewpoint()`
  **round-trip** unit test (camera + section + visibility restore to the same state).
- **Anchor model:** discussion-service tests for `anchor` create/read/round-trip and the
  live `anchor` payload; null-anchor regression (existing comments unchanged).
- **BCF-XML:** golden-file round-trip — import a reference `.bcfzip` from Solibri/BIMcollab,
  export it back, and diff (GUIDs preserved, camera/components/clipping intact). Validate
  against the buildingSMART `.xsd`s.
- **BCF-API:** contract tests against the foundational endpoints; a manual acceptance pass
  with a real **BCF Manager** (BIMcollab add-in) logging in via OAuth and syncing a topic.
- **IFC GUID:** unit tests for the compressed-22-char ↔ UUID converters (bespoke base64
  alphabet — §17).

---

## 16. Risks & gotchas

- **IFC GUID format (the #1 trap).** BCF `Component.IfcGuid` is the **native 22-char
  compressed** GlobalId (bespoke base64 alphabet `0-9 A-Z a-z _ $` — off-the-shelf base64
  decodes it *wrong*); Topic/Comment/Viewpoint `Guid`s are ordinary 128-bit UUIDs. Keep the
  two namespaces distinct; if the store expands GlobalIds internally, convert with an
  IfcOpenShell-style codec. Gates §5.2.
- **CAD metadata is the deep item (M3).** Preserving STEP/IGES assembly + names + colors +
  layers + **PMI/GD&T** means walking the OCCT **XDE/XCAF** document (`XCAFDoc_ShapeTool` /
  `ColorTool` / `LayerTool` / `DimTolTool`) and *stopping* the current `XGetOneShape`
  flatten + label-discarding recenter — new export code, not a flag flip. PMI has two forms
  (graphical presentation vs **AP242 semantic** GD&T); semantic is the queryable prize but
  harder to extract, and non-AP242 STEP may carry none. Budget this as its own sub-project.
- **Stable object ids across re-conversion.** Annotations reference `object_refs`; those ids
  must survive re-processing the same source. IFC GlobalId is stable by construction; for
  CAD, key to **persistent OCAF label paths** (deterministic across runs), not array
  indices, or a re-convert silently orphans every CAD annotation. Verify determinism.
- **Non-IFC BCF components are lossy.** Only IFC yields BCF-native `IfcGuid` components; CAD/
  mesh/point-cloud viewpoints round-trip **camera + section + snapshot** but not element
  selection into strict IFC-only BCF tools. Document this as expected (§10), not a bug.
- **Point clouds have no native object identity.** A "segment/region" is derived
  (classification code or a segmentation pass), not intrinsic; treat point-cloud object
  refs as best-effort and don't promise element-level BCF for them.
- **Coordinates & units.** BCF is fixed to **meters + degrees**, no unit field. Scale
  camera / clipping-plane / line / bitmap coords into meters on export and back on import,
  and account for survey/base-point geo-referencing offsets or cameras land in the wrong
  place.
- **Camera kind.** Perspective uses `field_of_view` (deg); orthographic uses
  `view_to_world_scale` (a scale, not an angle) — never cross them; keep `up` orthogonal.
- **Visibility exception model.** `default_visibility` + exceptions can invert the whole
  scene if mishandled; pick the shorter exception list and keep component counts <~1000.
- **Snapshots.** Client-side capture (xeokit) is easy and is our path; **server-side
  headless rendering is hard** and we avoid it (issues originate in the viewer). Store
  whatever the client posts; base64 on POST, binary on GET.
- **Flat comments.** BCF has no nested replies — our nested tree **flattens** on export
  (order + optional viewpoint pin preserved). Accept the loss, or encode parent refs in
  text; do not block on it.
- **Extensions vocab.** Strict tools reject topic status/type/priority/label/stage values
  not in the project's `extensions`. Seed a sensible default vocabulary and surface it.
- **xeokit upgrade.** Verify NavCube #2016 is actually fixed before re-enabling; pin the
  exact version; the namespace is imported as `any`, so lean on the plugin smoke test.
- **2.1 vs 3.0.** Read both; **default exports to 2.1** unless the counterpart advertises
  3.0 (document store, `server_assigned_id`, `aspect_ratio` differ).

---

## 17. Resolved decisions

1. **Subservice stack → Python + FastAPI**, mirroring `discussion` / `convert_search_ai` /
   `ldap_manager` / `audit`. Reuses the OAuth/JWKS verification and per-tenant-schema
   plumbing directly — no new stack.
2. **Data seam → a shared storage interface**, not cross-service REST (§12): a
   `comment_store` library that both the discussion service and `bcf_service` import, so
   both doors write through one guarded code path. Annotation-generated comments **signal
   the comment area to update live** (via the discussion live layer), and each carries a
   **deep link into the model** that restores the annotation's **full navigation state —
   camera + section/slice planes + visibility + selection** (`setViewpoint()`) — and then
   centers/highlights the referenced object (§9). The comment link and the on-model marker
   resolve to the same restore; this is the same state BCF viewpoints carry, so it
   round-trips as BCF (§10).
3. **"Project" → a FileEngine folder.** All related models in a folder map onto one BCF
   project; `bcf_project` maps `project_id` → the folder uid (§10).
4. **BCF version → 2.1 primary**, to minimize bleeding-edge complications and maximize
   desktop-tool round-trip. Keep the internal model 3.0-capable behind the serializer, but
   don't invest in 3.0 / the OpenCDE Foundation API up front.
5. **xeokit → stay on the monolithic `@xeokit/xeokit-sdk`** as long as it covers the
   required plugins (it does — section/measure/annotate/BCF/navcube all ship there). **Plan
   the migration to the scoped `@xeokit/*` SDK for when upstream stabilizes** — track it as
   a future workstream, triggered by upstream maturity, and don't couple this work to it.

---

## 18. Future roadmap proposal — conversational & agentic access to the model

> **Status: proposal, not committed scope.** This is a forward-looking extension, *not*
> part of the build defined above. It's included because the metadata foundation (§5.2) and
> the annotation substrate (§9) are exactly its hard prerequisites — naming it keeps their
> justification honest: the metamodel isn't only for the object tree and BCF; it's the
> structured substrate an AI reasons over and acts on. Sequence it on the roadmap **after**
> those land; do not let it expand the current scope.

Once each model delivers a **metamodel** (§5.2) and annotations are **governed comments**
(§9), a conversational — and, gated, *agentic* — interface to the model falls out of pieces
the platform already ships: the RAG research chat, the MCP server/client, pgvector search,
and the viewer's imperative API (§5.3). Little of it is net-new; the value is wiring existing
capabilities to the model's newly-structured objects.

**Two levels, sharply distinguished by who acts.**

### Read — ask the model (ungated)
Object-level Q&A grounded in the metamodel: *"list every duct over 400 mm on level 3,"*
*"which parts carry a flatness GD&T callout,"* *"what changed between this version and the
last."* Today's pipeline already indexes model metadata as **text** for RAG (so keyword-level
"chat with your model" works now); the metamodel upgrades this to **structured, object-level**
answers that cite specific elements. Every answer deep-links to the object/viewpoint (§9), so a
citation *opens the model framed on the thing it's about*. Read is **permission-scoped but
ungated** — it only ever surfaces what the asker may already see.

### Act — the assistant proposes; a human commits (gated)
The agentic half exposes the model + annotation substrate as **MCP tools** the assistant can
call: *query objects*, *highlight / isolate*, *open a viewpoint*, and — the state-changing
ones — *create an annotation*, *raise a BCF topic*, *set a topic's status / assignee*. Because
annotations are comments, a chat-raised issue lands in the **same governed substrate** and
**round-trips as BCF** (§10–12) — so *"walk the model and open a coordination issue on every
clash between the ducts and the structure"* produces real, permissioned, tool-visible BCF
topics, not throwaway chat text.

**Human-in-the-loop gating is the rule, not a feature.** It reuses the exact model already
shipped for the chat's MCP client: **read is free; every state-changing action is _proposed_,
not executed, and requires explicit user confirmation** (the per-call Approve/Deny consent the
chat already has), under **admin-held gates** (default-deny, admin-provisioned tools, per-role
scope, read-only-vs-write designation), executed under the **user's own identity**
(impersonation), and **fully audited**. The assistant drafts *"I'll open 4 issues: … Approve?"*
and nothing writes until the human says yes. State-changing model actions are exactly the class
the platform already treats as confirmation-required (see `FILEENGINE_ROADMAP.md` Phase 9.1's
MCP-client governance — this inherits it wholesale).

**What would actually need building** (small, mostly glue): a metamodel-backed **query/tool
layer** (structured queries + embeddings over object-property text); a handful of **MCP tools**
(`query_objects`, `highlight`, `open_viewpoint`, `create_annotation`, `raise_bcf_topic`,
`set_topic_status`) mapped onto the viewer API (§5.3) and the shared `comment_store` (§12); and
a viewer that can be **driven** by those tools (already true after §5.3). No new auth, no new
issue store, no new consent mechanism — all reused.

**Why it's worth naming.** A differentiator no proprietary incumbent offers self-hosted:
permission-scoped, audited, conversational **and agentic** access to BIM *and* CAD/CAM, where
the assistant can not only answer about a model but *act* on it — every action a governed,
human-approved, BCF-round-trippable annotation. It also compounds "many doors, one core": the
same annotation substrate is reachable by a **human** in the viewer, an **AEC tool** over BCF,
and an **AI agent** over MCP — one governed truth, three doors.

**Dependencies & sequencing.** Gated on §5.2 (metamodel) + §9 (annotation substrate) + §12
(`comment_store` + BCF). Slots onto the roadmap alongside the existing MCP/AI phases; the
admin-held-gates + HITL model in `FILEENGINE_ROADMAP.md` Phase 9.1 already specifies the
governance this inherits. **Not on the critical path of this plan.**

---

## 19. Future roadmap proposal — inter-version model diff

> **Status: proposal, not committed scope** (as §18). A strong review/QA capability that the
> metadata foundation (§5.2) + FileEngine's immutable versioning make natural — but not part
> of the build defined above. Sequence after §5.2; do not expand current scope.

FileEngine keeps every version of every model, so *"**what changed between revision C and
D**"* — the core design-coordination / QA-QC / change-review question in both AEC and
mechanical CAD — should be answerable *in the viewer*. Nothing in the stack answers it today.

**What xeokit gives us (and doesn't).** xeokit ships **no** diff / compare / revision plugin.
A 2019 request (xeokit-sdk issue **#92, "Model comparison"**) was resolved not by building a
diff tool but by shipping the **primitives**: load-time per-model transforms and
**`globalizeObjectIds`** (so two revisions that share IFC GlobalIds load into one scene
without id clashes). So a version diff is a **build-on**, and the established division of
labor is: **compute the delta upstream, render it in xeokit.**

**Compute the delta (server-side).** The §5.2 metamodel is exactly what makes this possible —
both versions' objects are addressable by a **stable id** (IFC GlobalId for BIM; OCAF label /
property key for CAD). Set-diff the id sets → **Added** (only in new) / **Removed** (only in
old); for the intersection, flag **Changed** by comparing property sets, type, and a geometry
hash / AABB. For IFC this is nearly free: the pipeline **already opens the model with
IfcOpenShell** (§5.2), whose **`IfcDiff`** produces precisely Added/Removed/Changed keyed on
GlobalId. Compute once and cache as a **diff rendition** — a hidden child keyed to
`(versionA, versionB)` — so the SPA stays a pure renderer (compute is server-side, like
conversion).

**Render the delta (in the viewer).** Load both versions into one Viewer with
`globalizeObjectIds`, map each object to its delta class, and drive the per-object appearance
API (§5.3 — `colorize` / `xrayed` / `visible`):
- **Overlay** — ghost/X-ray the unchanged baseline; colorize **added** (green), **removed**
  (red, from a retained ghost of the old version), **changed** (amber); toggle each set.
- **Side-by-side** — two camera-synced Viewers (the pattern the maintainer recommended for
  #92), old and new, delta colorized in each.
- **Changed-only** — isolate the delta; the object tree filters to changed objects with a
  before/after property panel.

**Why it compounds the rest of the plan:**
- **Feeds the issue substrate.** Any added / removed / changed object can seed an
  **annotation / BCF topic** ("review this change") in one click — the diff becomes governed,
  assignable, BCF-round-trippable coordination issues (§9–12), not a throwaway view.
- **The agentic read+act path (§18).** *"What changed between this version and the last, and
  open an issue on every new slab penetration"* = the agent runs the diff (read) and
  **proposes** the issues (human-gated write). The diff is the structured input the
  conversational interface reasons over.
- **CAD/CAM, not just BIM.** A changed **tolerance / GD&T callout** or a swapped part is a
  diff result — high value for manufacturing QA and CAM review. This is where "preserve as
  much internal metadata as possible" (§5.2, principle 7) pays off well beyond buildings.

**Gotcha — id stability across versions.** Semantic diff hinges on the object id being the
*same element* across revisions. Within FileEngine's own version lineage (same source, same
authoring tool) GlobalIds / OCAF labels are typically stable; where an authoring tool
**regenerates** ids between exports, semantic diff degrades and must fall back to
**geometry / property hashing** (IfcOpenShell documents a hashing approach). Detect and
surface the low-confidence case rather than silently mis-pairing objects.

**Dependencies & sequencing.** Gated on §5.2 (the metamodel that supplies the object keys) +
FileEngine's existing versioning; reuses IfcOpenShell (already in the pipeline) for the IFC
case. Discipline-neutral (principle 8). Off this plan's critical path — a strong follow-on
once the metadata foundation lands.

---

## 20. References

- `design_documents/3D_MODEL_VIEWER_PLAN.md` — the baseline viewer this extends.
- `convert_search_ai/design_documents/XEOKIT3D_PLUGIN.md` — the XKT conversion pipeline
  (owner of the §5.2 GlobalId prerequisite).
- Roadmap `FILEENGINE_ROADMAP.md` — Phase 2 (anchored discussion / one annotation
  substrate), Phase 7.2 (xeokit suite + BCF), Phase 8.1 (openBIM issue hub), Phase 1.7
  (shared OAuth / OIDC — the BCF-API auth).
- buildingSMART **BCF-API** — https://github.com/buildingSMART/BCF-API (release_2_1,
  release_3_0).
- buildingSMART **BCF-XML** — https://github.com/buildingSMART/BCF-XML (file format,
  `.xsd`s).
- xeokit **BCFViewpointsPlugin** — Saving/Loading BCF Viewpoints (getViewpoint/setViewpoint;
  BCF 2.1 conformant; matches by IFC globalId).
- IFC GlobalId — buildingSMART Technical, IFC-GUID guidance (compressed 22-char form).
- xeokit-sdk issue **#92 "Model comparison"** — https://github.com/xeokit/xeokit-sdk/issues/92
  (no diff plugin; resolved by shipping `globalizeObjectIds` + per-model transforms — §19).
- xeokit `XKTLoaderPlugin#globalizeObjectIds`, `Scene`/`Entity` colorize/xray/visible,
  `MetaScene`/`MetaModel`/`MetaObject` — the primitives a diff renders on (§19).
- IfcOpenShell **`IfcDiff`** — https://docs.ifcopenshell.org/ifcdiff.html (Added/Removed/
  Changed keyed on GlobalId; geometry-hash fallback) — the upstream delta computation (§19).
