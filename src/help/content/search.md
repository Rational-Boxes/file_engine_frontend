---
id: search
title: Searching your files
category: Getting Started
keywords: [search, find, query, metadata, cad, bim, ifc, engineering, full-text, filename]
order: 2
related: [getting-started, files, cad-bim, ai-research]
---

The **Search** tab finds files across everything you have access to — by their name
and by what's *inside* them. Type a few words and press **Search**; results are
ranked by relevance, each with the filename and a short highlighted snippet showing
where your terms matched.

## What search looks through

Search covers more than filenames:

- **File names** — with fuzzy matching, so a small typo or partial name still finds
  the file.
- **Document contents** — the extracted text of your documents (PDFs, Office files,
  Markdown, HTML, and more), so you can find a file by a phrase inside it.
- **File metadata** — any descriptive information pulled out of a file during
  processing, not just its body text.

## Engineering, CAD & BIM files are searchable too

This is the part that's easy to miss: FileEngine reads the **metadata inside
engineering and 3D models** and makes it searchable, so you can find a model by what
it *contains* rather than only by its filename. Depending on the format, that
includes things like:

- **BIM (IFC)** — element names, types, descriptions, and property sets (for
  example, finding every model that contains a wall or space named a certain way).
- **CAD (STEP, IGES)** — product and part names, descriptions, author and
  originating-system details from the file header.
- **3D models (glTF/GLB, OBJ, VRML)** — the authoring tool, and mesh, material, and
  node names.
- **City models (CityJSON)** — object types and attribute values.
- **Point clouds (LAS/LAZ) and meshes (STL, PLY)** — header information such as the
  capturing system and the software that produced the file.

So a search for a material, a tool name, an IFC element, or a part number can surface
the CAD/BIM file that mentions it — not just documents that happen to talk about it.

## Reading results

Each result shows the file name and a snippet with your matched terms highlighted,
ordered by how well it matches. Open a result to preview the file (including the 3D
viewer for models — see [viewing CAD & BIM models](#cad-bim)).

## Good to know

- **You only ever see what you can open.** Results are filtered by permissions — a
  file you don't have read access to never appears, even if its contents match your
  query. See [how permissions (ACLs) work](#acl-basics).
- **Newly added files take a moment to become searchable.** After you upload a file,
  it's processed in the background to extract its text and metadata; it becomes
  searchable once that finishes, not the instant it lands.
- **Some files have little or nothing to index.** A pure-geometry export with no
  embedded names or properties, or an unsupported format, may only be findable by its
  filename.
- **Looking for an answer, not a file?** Search finds *files*. If you want the system
  to read across your documents and answer a question with citations, use the
  [AI research chat](#ai-research) instead.
