/*
 * Behavioural test for src/content/code-usage.js (the claude.ai/code usage markers).
 *
 *   npm install jsdom      # not vendored; this repo has no package.json on purpose
 *   node tools/test-code-usage.js
 *
 * The popover below is a faithful reproduction of the real claude.ai/code usage
 * panel, captured with tools/diagnose-code-rows.js. If claude.ai restructures it,
 * recapture and update this fixture -- that is the point of keeping it.
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
	({ JSDOM } = require('jsdom'));
} catch {
	console.error('jsdom is not installed.  Run:  npm install jsdom');
	process.exit(2);
}

const row = (label, reset, pct) => `
  <div class="flex flex-col">
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-footnote text-primary truncate">${label}</span>
      <span class="flex items-baseline gap-1.5 text-footnote text-muted tabular-nums shrink-0">
        <span>${reset}</span><span>${pct}</span>
      </span>
    </div>
    <div role="progressbar" class="mt-pad-xs h-[4px] rounded-[3px] overflow-hidden bg-alpha-1">
      <div class="h-full bg-fill-accent transition-[width]"></div>
    </div>
  </div>`;

const html = `<!doctype html><html><body>
<div data-cds="Popover" role="dialog" class="rounded-card bg-surface-3">
 <div>
  <h2 class="sr-only">Usage</h2>
  <div class="flex flex-col py-sm">
    <div class="flex flex-col">
      <button class="group flex items-center gap-2">
        <span class="text-footnote text-muted">Context window</span>
        <span class="text-footnote text-muted tabular-nums ml-auto">243.8k / 1M (24%)</span>
      </button>
      <div class="mt-pad-xs px-lg pb-xs"><div class="flex flex-col gap-xs">
        <div data-cds="StackedMeter" role="img" aria-label="Context window: Messages: 148.6k, 15%">
          <div class="absolute inset-y-0"></div>
        </div>
      </div></div>
    </div>
    <div class="mx-pad-lg my-xs h-px bg-alpha-2"></div>
    <div class="flex flex-col gap-xs">
      <div class="flex items-center justify-between gap-2 px-lg py-xs">
        <span class="text-footnote text-muted">Plan usage limits · Max (5x)</span>
      </div>
      <div class="flex flex-col gap-sm px-lg pb-xs">
        ${row('5-hour limit', 'Resets in 4 hr 43 min', '7%')}
        ${row('Weekly · all models', 'Resets Thu 8:00 PM', '28%')}
        ${row('Weekly · Fable', 'Resets Thu 8:00 PM', '14%')}
        ${row('Usage credits', '$0.00 of $50.00', '')}
      </div>
    </div>
    <div class="mx-pad-lg my-xs h-px bg-alpha-2"></div>
    <button>See detailed breakdown</button>
  </div>
 </div>
</div>
</body></html>`;

const dom = new JSDOM(html, {
	url: 'https://claude.ai/code/session_test',
	pretendToBeVisual: true,
	runScripts: 'outside-only'
});
const { window } = dom;
window.eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'code-usage.js'), 'utf8'));
const CU = window.ClaudeCounter.codeUsage;

let failures = 0;
const check = (name, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

// --- pure parsing, against strings taken verbatim from the live panel ---
const now = new Date('2026-09-01T15:47:00');
check('isCodeSurface(/code/session_x)', CU.isCodeSurface('/code/session_x'), true);
check('isCodeSurface(/chat/abc)', CU.isCodeSurface('/chat/abc'), false);
check('isCodeSurface(/codex)', CU.isCodeSurface('/codex'), false);
// textContent concatenates children, so the minutes run straight into the percent.
check('parseRelativeReset concatenated', CU.parseRelativeReset('Resets in 4 hr 43 min7%'), (4 * 60 + 43) * 60000);
check('parsePercent takes the last %', CU.parsePercent('Context window243.8k / 1M (24%)'), 24);
check('parseWindowMs 5-hour', CU.parseWindowMs('5-hour limit'), 5 * 3600000);
check('parseWindowMs weekly', CU.parseWindowMs('Weekly · all models'), 7 * 86400000);
check('parseWindowMs credits -> null', CU.parseWindowMs('Usage credits $0.00 of $50.00'), null);
check('parseWindowMs context -> null', CU.parseWindowMs('Context window 243.8k / 1M (24%)'), null);

// --- injection ---
const pop = CU.findUsagePopover();
check('popover found', !!pop, true);
check('rows marked', CU.enhancePopover(pop), 3);
check('markers in DOM', window.document.querySelectorAll('[data-cc-window-marker]').length, 3);

// A row whose bar has no reset window must be left alone. Locate it structurally,
// not via rowFor(), which is itself under test.
const bars = [...window.document.querySelectorAll('[role="progressbar"]')];
const credits = bars.find((b) => /Usage credits/.test(b.parentElement.textContent || ''));
check('credits bar found', !!credits, true);
check('rowFor(credits) is null', CU.rowFor(credits), null);
check('credits bar unmarked', !credits.querySelector('[data-cc-window-marker]'), true);
check('context meter unmarked', !window.document.querySelector('[data-cds="StackedMeter"] [data-cc-window-marker]'), true);

// Re-running must not duplicate markers.
CU.enhancePopover(pop);
CU.enhancePopover(pop);
check('idempotent after 3 runs', window.document.querySelectorAll('[data-cc-window-marker]').length, 3);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
