---
id: cad-bim
title: Viewing CAD & BIM models
category: 3D & CAD/BIM
keywords: [cad, bim, 3d, model, ifc, gltf, step, point cloud, mesh, viewer]
order: 1
related: [comments, search]
---

FileEngine includes an interactive **3D viewer** for engineering and building
models, so you can inspect a CAD part or a BIM building model in the browser without
extra software.

## Supported formats

The viewer recognizes and renders:

- **BIM** — IFC (building information models)
- **CAD** — STEP, IGES, and related solid-model formats
- **glTF / GLB** — general 3D scenes
- **Point clouds** — LAS / LAZ
- **Meshes** — STL, PLY, OBJ, WRL
- **City models** — CityJSON

When a file is one of these formats, the viewer becomes available from the file's
details.

## Navigating a model

- **Orbit, pan, and zoom** to move around the model.
- The **Nav step** control sets how far each zoom/pan step moves — lower it for
  fine control on small CAD parts, raise it for large scenes. There's a reset if you
  overshoot.
- **Reset camera** returns to the default view.
- Use **Download original** to get the source file, or **Open file location** to
  jump to it in the browser.

## The object tree

For structured models (such as IFC), the **Objects** tree on the side lists the
model's components. Use it to explore the hierarchy and locate specific elements.
Toggle the tree with the **☰** button to give the model more room.

## Discussing a model

You can open [comments](#comments) alongside the model and dock them to the side or
bottom, so you can point at and talk about specific parts of the design while
viewing it.

## Finding models

The metadata inside these files — IFC element and property names, CAD part and
product names, materials, and header details — is indexed, so you can locate a model
by what it contains using [search](#search), not just by its filename.
