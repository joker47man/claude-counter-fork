# Maintaining this fork

This is a fork of [she-llac/claude-counter](https://github.com/she-llac/claude-counter),
kept alive because upstream has gone quiet: last push **2026-03-21**, with 14 open
pull requests and 36 open issues as of 2026-09-01 — including several fixes for the
claude.ai redesign that broke the extension for everyone.

## Why the fork exists

claude.ai's August 2026 redesign (the one that added the **Chat/Cowork** switch)
moved the DOM that this extension hangs its UI on. Upstream never merged a fix, so
the usage bars render on top of the composer controls and the token counter
disappears entirely.

## The thing that will break again

Every failure mode this extension has ever had is the same failure mode:
**claude.ai renames a `data-testid`, an attach path returns early, and the feature
silently vanishes with no error.** That is what happened in June (issue #26),
again in August (#45, #47), and it is what will happen next.

Two consequences for anyone maintaining this:

1. **Never anchor UI after an out-of-flow element.** Inserting after a
   `position: absolute` element drops your node into the normal flow of the nearest
   positioned ancestor — which is how the usage row ended up stacked on top of the
   composer buttons. `attachUsageLine` now rejects out-of-flow ancestors explicitly.
2. **Fail loudly.** `CC.warnOnce(key, message)` in `src/content/constants.js` leaves
   exactly one console breadcrumb per cause. If a feature is missing, open the
   devtools console first — it should tell you which selector stopped matching.

## When it breaks: diagnosing

1. Open a conversation on claude.ai, open devtools.
2. Paste the contents of [`tools/diagnose-dom.js`](./tools/diagnose-dom.js) into the console.
3. It prints (and copies) a JSON report: which selectors still match, where the
   Chat/Cowork switch lives, the ancestor chain above the model selector and the
   chat title with each element's `position`/`display`/`flexDirection`, and whether
   our own nodes attached and where they landed.

That report is enough to write the fix without guessing.

Selectors live in one place: `CC.DOM` in `src/content/constants.js`. Keep old
selectors in the comma-separated list when adding new ones — it costs nothing and
keeps older claude.ai builds working.

## A trap worth knowing about

`src/content/ui.js` and the userscript need a few non-breaking spaces for
spacing in the header. They are built with `String.fromCharCode(160)` rather
than a Unicode escape for U+00A0 or a pasted literal, and that is deliberate.

Pushing these files through the GitHub contents API rewrote each such
escape into a raw U+00A0 character. The JavaScript is functionally identical --
both forms evaluate to codepoint 160 -- but a raw non-breaking space is
invisible in source and in a diff, so the working copy and the repo drifted
apart with nothing visible to review. Building the character from its code
point keeps the source pure ASCII at those sites, so no transport can rewrite
it and the character has a name where it is used.

If you add another one, do the same. And when pushing files by API rather than
`git push`, verify with the git blob SHA (`git rev-parse HEAD:<path>` against
the blob sha the API reports) -- comparing rendered content by eye will not
catch an invisible character.

## The Claude Code surface

`src/content/code-usage.js` handles `claude.ai/code`. It does **not** draw its own
usage row: Claude Code's native popover already has one. It only adds the window
position marker that the native bars lack.

It reads everything from the popover's own text rather than from the `/usage` API,
which is deliberate — it means the marker always agrees with the numbers next to it,
and it works for rows the API knows nothing about (the per-model weekly row).

Two things that will bite:

- `textContent` **concatenates children**, so a row reads `Resets in 4 hr 43 min7%`.
  A trailing `\b` on the minutes pattern fails between `n` and `5`; the patterns use
  a `(?![a-z])` lookahead instead.
- A row is identified as the nearest ancestor holding **exactly one** `progressbar`
  that also mentions a reset. Without the one-bar rule the walk climbs past the
  credits row (which has a bar but no reset) and matches the container holding every
  row, stamping the credits bar with the 5-hour window's numbers.

Re-capture the DOM with `tools/diagnose-code-rows.js` and update the fixture in
`tools/test-code-usage.js` when the panel changes.

```bash
npm install jsdom            # deliberately not vendored; this repo has no package.json
node tools/test-code-usage.js
```

## Scripts pushed by API lose the executable bit

The GitHub contents API creates every file as mode `100644`. Anything in `tools/`
pushed that way arrives non-executable, so a fresh clone gets `Permission denied`
on `./tools/build.sh` even though the content is byte-perfect.

Blob-SHA verification does **not** catch this: the blob is the file's content, and
the mode lives in the tree entry, so an identical SHA can still be the wrong mode.
Check with `git ls-tree HEAD tools/` — the scripts should read `100755`.

To restore it:

```bash
git update-index --chmod=+x tools/build.sh tools/check-sync.sh tools/sync-upstream.sh
git commit -m "Restore the executable bit on tools/ scripts"
git push
```

Until then, `bash tools/build.sh` works regardless of mode.

## Repo layout

| Path | What it is |
|---|---|
| `manifest.json` | MV3 manifest; content scripts load in dependency order |
| `src/content/` | Content scripts, loaded in this order: `constants` → `code-usage` → `bridge-client` → vendor tokenizer → `tokens` → `ui` → `main` |
| `src/injected/bridge.js` | Runs in page context; intercepts claude.ai API responses |
| `src/vendor/o200k_base.js` | Vendored tokenizer (2 MB), from gpt-tokenizer (MIT) |
| `userscript/claude-counter.user.js` | **A bundled copy of the same logic.** Any `src/` fix must be mirrored here |
| `tools/` | Build, upstream sync, drift check, DOM diagnostics, code-usage test |

> The userscript is a hand-maintained concatenation, not a build output. It is the
> easiest thing to forget. Grep it for the symbol you just changed.

## Building

```bash
./tools/build.sh
```

Produces `dist/claude-counter-<version>.zip` (Chrome/Edge) and `.xpi` (Firefox).
Only the files the extension actually loads are packaged.

**The manifest must be at the archive root**, not nested inside a folder — nesting
is what causes Chrome's "Could not unzip extension" (upstream issue #36).
`build.sh` zips from a staging directory to guarantee this.

Firefox note: an unsigned `.xpi` will not install in release Firefox. Use
`about:debugging` → *Load Temporary Add-on*, or Developer Edition with
`xpinstall.signatures.required=false`.

## Staying in sync with upstream

```bash
./tools/sync-upstream.sh          # report what's new upstream
./tools/sync-upstream.sh --merge  # report, then merge upstream/main
```

`main` carries our patches; `upstream/main` is merged in when it moves. Because
upstream is dormant this should be quiet — but if the original maintainer returns
and merges the community fixes, expect conflicts in `src/content/ui.js` and
`userscript/claude-counter.user.js`, since that is where everyone is fixing the
same breakage.

After any merge: rebuild, reload the extension, and check the console for
`[Claude Counter]` warnings before cutting a release.

## Releasing

1. Bump `version` in `manifest.json` **and** `@version` in the userscript header.
2. `./tools/build.sh`
3. Attach both artifacts to a GitHub release.

## Upstreaming

The fix in this fork is upstream PR
[#46](https://github.com/she-llac/claude-counter/pull/46) by @ashishahir1, which is
unmerged. If upstream ever revives, close our patches in favour of theirs rather
than carrying a permanent divergence. MIT licensed; keep `LICENSE` and
`THIRD_PARTY_NOTICES.md` intact.
