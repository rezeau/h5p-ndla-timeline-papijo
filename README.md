# h5p-timeline

An H5P wrapper around [TimelineJS](https://timeline.knightlab.com/). Please note
that TimelineJS is used as a module dependency and itself is licensed under the
Mozilla Public License 2.0. Please find the code if TimelineJS at
https://github.com/NUKnightLab/TimelineJS3.

The font that is included is PT Serif by ParaType and is licensed under the
[Open Font License](https://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=OFL).

## Building and running on localhost
Please first refer to https://h5p.org/development-environment if you are not
familiar with how an H5P development environment works.

Clone this repository with git and check out the branch that you are interested
in (or choose the branch first and then download the archive, but learning
how to use git really makes sense).

Change to the repository directory and run
```bash
npm install
```

to install required modules. Afterwards, you can build the project using
```bash
npm run build
```

or, if you want to let everything be built continuously while you are making
changes to the code, run
```bash
npm run watch
```
Before putting the code in production, you should always run `npm run build`.

Also, you should run
```bash
npm run lint
```
in order to check for coding style guide violations.

In addition, you should run
```bash
npm run test
```
to run some automated tests that may file if new code broke things.

In order to pack an H5P library, please install the
[H5P CLI tool](https://h5p.org/h5p-cli-guide) instead of zipping everything
manually. That tool will take care of a couple of things automatically that you
will need to know otherwise.

In simple cases, something such as
```bash
h5p pack <your-repository-directory> my-awesome-library.h5p
```
will suffice.

For more information on how to use H5P, please have a look at
https://youtu.be/xEgBJaRUBGg and the H5P developer guide at
https://h5p.org/library-development.

## Development notes

### Ordinary description text and compatibility

Title-slide descriptions and event "Description text" now use ordinary H5P HTML
text fields. There is no child content-type selector or text-library dependency.
The event's separate Text/Image/None description mode and its conditional fields
are unchanged. Ordinary formatting, tables, links, and font settings are retained.

Previously both "Text" (`H5P.AdvancedText 1.1`) and "Advanced Text Papi Jo"
(`H5P.AdvancedTextPapiJo 1.2`) stored descriptions as:

```json
{
  "library": "H5P.AdvancedTextPapiJo 1.2",
  "params": { "text": "<p>Description</p>" },
  "subContentId": "child-uuid",
  "metadata": { "title": "Description" }
}
```

The new value is a direct string. Ordinary Text retains its HTML verbatim;
PapiJo is deliberately converted to raw visible body text. Runtime reads
accept either shape without modifying stored data or loading child libraries,
including title, left/right, and custom layouts. Child metadata and subContentId
are no longer used. The description wrapper class, link repair, scrolling
accessibility, image descriptions, media, and resize lifecycle remain.

`upgrades.js` registers the standard H5P **1.1 -> 1.2** content upgrade. It extracts
`params.text` for both former choices, including hidden title slides and
descriptions currently hidden by Image/None mode. Ordinary Text is unchanged.
For PapiJo, `<p>Hello <strong>world</strong>.</p>` becomes `"Hello world."`.
Tooltip spans retain only their visible words; annotations, explanations, IDs,
images, child metadata, and all additional child parameters are discarded.
Links retain visible text only. Paragraphs, headings, line breaks and list items
have newline separators; table cells have tabs and rows have newlines. HTML5
named and numeric entities are decoded once. Empty or missing legacy text
becomes an empty string; already-converted strings are unchanged.

The conversion uses a text tokenizer without DOM APIs or external dependencies.
The HTML5 entity table in `src/H5P/html-entities.json` comes from Python 3.13's
standard-library `html.entities.html5` (WHATWG HTML character references).
`npm run build:upgrades` inlines this data into standalone `upgrades.js` from
`src/H5P/description-upgrades.template.js`; production builds run this step too.
Edit the template and regenerate; tests verify the generated file matches.

**This is an unreleased schema change prepared as 1.2.0 for upgrade testing.**
Library/package versions are 1.2.0. Do not install these semantics over an
existing 1.1 library: H5P's
HTML editor concatenates the old object into its markup as `[object Object]`,
and server validation can empty invalid text before runtime reads it. The
release must be **1.2.0**, with existing 1.1 contents upgraded before opening
them in the new editor. A patch-only update cannot activate
this migration. See [H5P content upgrade documentation](https://h5p.org/documentation/developers/content-upgrade).

The special tooltip controller, child routing adapter, and `h5p-advanced-text`
CSS scope have been removed. Enhanced tooltips are no longer initialized, even
if a host happens to preload the old library. Unupgraded HTML retains its visible
words but does not display tooltip explanations or managed tooltip images.

The upgrade **refuses the entire conversion without any mutation** for genuinely
malformed/unknown structures: an unknown description library, invalid wrapper
or params, non-string `params.text`, or unknown ordinary Text parameters.
PapiJo-specific data never triggers refusal. Replacements are applied only after
every description passes inspection. Errors include the affected field path.
Keep the original content and media until migration has been verified. The
upgrade itself only changes parameters. A host may remove unreferenced media
on later editor save; the inspected CLI does so for discarded tooltip images.

### H5P CLI retest

The previous CLI's `H5P.NDLATimelinePapiJo-1.1` library folder was a junction to this
working repository. Applying the new semantics through that junction while the
content still says 1.1 bypasses the staged 1.2 hook. The native HTML editor then
stringifies a legacy description object. The tested `timeline-old` content has
already saved `<p>[object Object]</p>`; its original description cannot be
recovered from that string. Retest from an original content package or backup,
with the old 1.1 library kept intact and the changed library installed as 1.2.0,
then run the content upgrade before opening/saving the editor.

The inspected CLI upgrade engine logs callback errors but continues updating
library version metadata. For malformed contents, treat any upgrade error as
failure and retain the original; do not open/save its output. Native H5P's
content upgrade process propagates these errors and stops instead.

Before releasing, verify upgrade and editor open/save on the target H5P host.
Automated tests cover lossy PapiJo migration in a worker-like environment,
exact ordinary Text HTML preservation, atomic malformed-data failure, schema
structure, legacy/new runtime rendering, and the installed TimelineJS lifecycle.

The genuine CLI upgrade test on 2026-10-07 used the original 1.1.1 source from
commit `4207820cd829ae220837f5fc94e3b59be851b121`, exported and built independently.
The installed `H5P.NDLATimelinePapiJo-1.1` is a real copy with the original
description selectors; `H5P.NDLATimelinePapiJo-1.2` is a separate working-tree
junction. Fresh legacy content was created and saved in the 1.1 editor before
exposing 1.2, with ordinary formatting, PapiJo formatting, text-tooltip and
image-tooltip examples. The normal CLI View endpoint ran the upgrade and made
its automatic 1.1 backups. Stored data was verified before opening the 1.2 editor.
It preserved ordinary HTML exactly and converted PapiJo examples to plain text.
Editor save/reopen and runtime checks passed. A completely new 1.2 Timeline also
passed authoring, save/reopen, formatting and runtime checks.

The CLI's first upgrade response briefly retained a 1.1 content-version label
while asynchronous metadata generation completed; subsequent responses and
stored metadata correctly reported 1.2. Background View requests can also
auto-upgrade other open contents when a new library is exposed. The previously
damaged `timeline-old` instance advanced its version this way but retained its
pre-existing `[object Object]` string; it was excluded from migration evidence.
