---
id: cad-bim
title: Viewing CAD & BIM models
category: 3D & CAD/BIM
keywords: [cad, bim, 3d, model, ifc, gltf, step, point cloud, mesh, viewer, section, slice, measure, see-through, x-ray, annotation, navigation]
order: 1
related: [comments, search, files]
---

FileEngine includes an interactive **3D viewer** for engineering and building
models, so you can inspect a CAD part or a BIM building model in the browser without
extra software — navigate it, cut into it, measure it, make parts see-through, and
pin comments to specific elements.

## Supported formats

The viewer recognizes and renders:

- **BIM** — IFC (building information models)
- **CAD** — STEP, IGES, and related solid-model formats
- **glTF / GLB** — general 3D scenes
- **Point clouds** — LAS / LAZ
- **Meshes** — STL, PLY, OBJ, WRL
- **City models** — CityJSON

When a file is one of these formats, the viewer becomes available from the file's
details. For IFC, glTF, and CityJSON the model also carries an **object tree** —
its real elements, hierarchy, and identity — which powers the tree, selection, and
element-level comments below.

## The viewer layout

The viewer opens full-screen with a **left side panel** and a title bar. The side
panel has two tabs:

- **Objects** — the model's element tree (and the see-through controls).
- **Tools** — navigation, section planes, and measurement.

Use the **☰** button in the title bar to show or hide the panel and give the model
more room. The panel edge is draggable to resize it.

Standard views live in the **title bar** (not the panel), so **Top**, **Front**,
**Iso**, **Fit sel** (frame the current selection), and **⟳ Reset** are always one
click away.

## Navigating a model

On the **Tools** tab, under **Navigation**:

- Choose how the mouse moves the camera: **⟲ Orbit** (rotate around the model),
  **🚶 Walk** (first-person), or **▦ Plan** (top-down). Orbit pivots about the point
  under your cursor.
- The **Nav step** slider sets how far each zoom/pan step moves — lower it for fine
  control on small CAD parts, raise it for large scenes; **⟲** resets it.

From the **title bar**, jump to **Top**, **Front**, or **Iso** orientations, **Fit
sel** to frame the current selection, or **⟳ Reset** to return to the default view.

**⬇ Download original** gets the source file, and **📂 Open file location** closes
the viewer and jumps to the file's folder in the [Files browser](#files).

## The object tree & see-through

For structured models, the **Objects** tab lists the model's components. Use it to
explore the hierarchy and locate specific elements.

To make parts translucent so you can see what's behind them:

1. Click **🔲 See-through** to turn on see-through mode.
2. Click any element in the tree — that element **and everything under it** become
   translucent. Click it again to make it solid.
3. **✕ Reset** clears all see-through at once.

## Cutting into a model (section planes)

On the **Tools** tab, under **Section planes**, add a cut-away:

- **✂X / ✂Y / ✂Z** cut straight through the model along an axis.
- **▣ Box** adds a six-sided section box to isolate a region.
- Drag a plane's control to slide or rotate it; **✕ Cuts** clears them all.

You can also cut exactly where you click: hold **Ctrl** (**⌘** on a Mac) and click a
surface, then choose **✂ Slice here** — a section plane is placed on that surface.

## Measuring

On the **Tools** tab, under **Measure**:

- **📏 Dist** measures point-to-point distance; **📐 Angle** measures an angle.
  Points snap to the model's vertices and edges.
- **■ Stop** ends the current tool; **✕ Meas** clears measurements.
- Switch the display units with the **mm / m / ft** selector.

## Commenting on the model

You can pin a comment to exactly what you're looking at, so a teammate can jump back
to the same view and element.

- **💬 Comment here** (Tools tab) attaches your current camera view to a new comment.
- **Comment on an element:** hold **Ctrl** (**⌘** on a Mac) and click the element,
  then choose **💬 Comment on this object**. The comment is tied to that element and
  your view.

A model comment shows a **🎯 View** link. Clicking it **restores the saved view** —
camera, section cuts, and visibility — and **selects the element** the comment is
about. These comments behave like any other [comment](#comments): replies, mentions,
resolve/reopen, and live updates all work, and they appear as markers in the model.

> Tip: the small **Ctrl/⌘+click an element for options** hint in the corner of the
> viewport is a reminder of the on-model menu (comment, slice, and navigation).

## Finding models

The metadata inside these files — IFC element and property names, CAD part and
product names, materials, and header details — is indexed, so you can locate a model
by what it contains using [search](#search), not just by its filename.
