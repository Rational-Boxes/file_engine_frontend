---
id: prompt-sets
title: Extraction prompt sets
category: AI Research
keywords: [prompt set, extraction, extract, extracted information, marked-up, fields, datasheet, certificate, values, schema, model, publish, draft, yaml, import, export, desktop application, reviera, test]
order: 3
related: [ai-research, folder-actions]
---

A **prompt set** says what to pull out of a kind of document: the fields you
want (a fire rating, a width in millimetres, a certificate's expiry date), what
type each one is, and any instructions. FileEngine reads each document in full
and answers every field with the value, its unit, and the exact words in the
document it came from, or says the document does not state it. It never
guesses.

Desktop applications such as Reviera run published prompt sets, and so can
folder automation.

## Who can build them

Open **System** in the top bar, then the **Prompt sets** tab. It is there for
tenant administrators and members of the **extraction editors** role; an
extraction editor who is not an administrator sees only this tab on the System
page. Everyone in the workspace can *use* a published set; only editors change
them.

## Building a set

1. **New set**, then give it a name. A **slug** is optional: it is the short
   machine name an application uses to find the set (for example
   `reviera.door-datasheet`).
2. Add **fields**. Each has a name (letters, digits and `_`), a label people
   see, and a type:
   - *Text (short)* or *Text (long)*;
   - *Number* or *Whole number*, with an optional **unit** (`mm`, `kg`, `W/m²K`)
     and minimum or maximum;
   - *Yes / no*; *Date*; *One of a list* (you give the allowed values);
     *List of text*.

   Mark a field **required** when a document of this kind should always state
   it. The model is still allowed to say "not found"; folder automation can then
   flag the document.
3. **Instructions** cover anything the fields don't, for example "if several
   products are listed, use the one named in the file name".
4. **Model**: leave it on *Default* unless a different model does better on
   these documents. The list shows the models your deployment offers.

## Trying it

The **Try it** panel runs your current edits, saved or not, on **pasted text**
or a **stored file** you pick. You see each field's value, unit and the quote it
came from. A value whose quote is not actually in the document is dropped and
counted, so you can tell when the instructions need tightening. You can pick a
different model for a single test to compare models on the same document.

Tests store nothing: no result is cached and nothing appears in any history.

## Seeing what was extracted

When folder automation or a desktop application has extracted values from a
document, opening that document's preview shows them: the document as a
**marked-up copy**, each value highlighted where it was found, and an
**Extracted information** panel beside it listing every field with its value,
unit and the quote it came from. **Page N** takes you to the highlight; a value
marked *Not marked in the PDF* was found in the text but could not be pinned to
a place on the page. If several prompt sets were run on the document, pick one
at the top of the panel.

This view is read-only. To mark the document up yourself, choose **← Back to
document**; **🧾 Extracted information** returns to the values. Only the
current version's values are shown: a new version shows them again once it has
been extracted. When no marked-up copy could be made (a very large document,
for instance) the values are shown beside the plain document; a file with no
PDF view, such as an image, has no extraction view. Try it results are never shown here,
because tests store nothing.

## Drafts and publishing

Saving keeps your work as a **draft**. Applications and automation never see
drafts. **Publish** makes the draft the new numbered revision (r1, r2, …).
Earlier revisions stay available, so an application that has been checked
against r2 can keep using r2.

**Retire** a set you no longer want used. Applications that ask for it are told
it was retired, and can be pointed to the set that replaces it.

## Sets published by applications

An application can publish the sets it needs by itself, without anyone setting
them up first. These show an **app** badge and the application's name. The
application may publish a new revision the next time it starts. If you want to
stop that:

- **Take over** makes the set yours; the application can no longer change it,
  though it keeps working if what it sends is identical;
- **Lock** stops any change by applications while leaving it in their care.

Folder automation that uses an application's set stays on the revision chosen
when the automation was saved, so a new application release never changes what
a folder extracts behind your back.

## Sharing sets as files

**⬇** exports a set as a YAML file; **Import YAML** reads one back, pasted or
uploaded. Imports always arrive as **drafts**, so someone looks at them and
tries them before they are used. If a set with the same name already exists
you choose whether the import becomes a new set or a new draft of the existing
one. Files from the older *extractor* format also import; their fields arrive as
text, and you set the types.

If a file names a model your deployment doesn't offer, the set is imported
anyway and runs on the default model; the builder tells you so.
