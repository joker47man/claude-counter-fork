/*
 * Claude Counter — claude.ai/code usage-popover diagnostic  (for v0.6)
 *
 * Goal: add reset countdowns onto the usage indicators inside Claude Code's
 * existing usage details box, rather than injecting a competing widget.
 * To do that we need that popover's structure.
 *
 * HOW TO RUN
 *   1. Go to https://claude.ai/code
 *   2. CLICK the circular usage indicator so the details box is OPEN
 *   3. Paste this into the devtools console while it stays open
 *
 * If the box closes when devtools takes focus, run it, then within 10s reopen
 * the box -- it re-scans every second for 10 seconds and reports the best hit.
 *
 * Reads only. No network calls. Prints no cookie or token VALUES.
 */
(() => {
	const seen = { best: null, bestScore: -1 };

	const describe = (el) => {
		if (!el) return null;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return {
			tag: el.tagName.toLowerCase(),
			testid: el.getAttribute('data-testid'),
			cds: el.getAttribute('data-cds'),
			role: el.getAttribute('role'),
			aria: el.getAttribute('aria-label'),
			cls: (el.className || '').toString().slice(0, 110),
			position: cs.position,
			display: cs.display,
			flexDirection: cs.flexDirection,
			children: el.childElementCount,
			rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
		};
	};

	// Outline an element's subtree shallowly: tag, identifying attrs, own text.
	const outline = (el, depth = 0, maxDepth = 4, acc = []) => {
		if (!el || depth > maxDepth) return acc;
		const ownText = [...el.childNodes]
			.filter((n) => n.nodeType === 3)
			.map((n) => n.textContent.trim())
			.filter(Boolean)
			.join(' ')
			.slice(0, 80);
		acc.push({
			d: depth,
			tag: el.tagName.toLowerCase(),
			testid: el.getAttribute('data-testid') || undefined,
			cds: el.getAttribute('data-cds') || undefined,
			role: el.getAttribute('role') || undefined,
			cls: (el.className || '').toString().slice(0, 70) || undefined,
			text: ownText || undefined
		});
		[...el.children].slice(0, 12).forEach((c) => outline(c, depth + 1, maxDepth, acc));
		return acc;
	};

	const scan = () => {
		const out = { url: location.pathname, ts: new Date().toISOString() };

		// 1. The circular indicator itself: a button/element wrapping an SVG ring,
		//    or labelled with usage/limit wording.
		const ringCandidates = [...document.querySelectorAll('button, [role="button"], a')].filter((el) => {
			const svg = el.querySelector('svg');
			const hasRing = svg && svg.querySelector('circle');
			const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
			const wordy = /usage|limit|quota|reset|%/.test(label);
			return hasRing || wordy;
		});
		out.indicatorCandidates = ringCandidates.slice(0, 10).map((el) => ({
			...describe(el),
			text: (el.textContent || '').trim().slice(0, 80),
			hasCircle: !!el.querySelector('svg circle')
		}));

		// 2. Anything currently open that looks like the details box.
		const popCandidates = [...document.querySelectorAll(
			'[role="dialog"], [role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-state="open"], [popover]'
		)].filter((el) => el.getBoundingClientRect().width > 0);

		// Score by how much it looks like a usage panel: percentages and reset wording.
		const score = (el) => {
			const t = (el.textContent || '').toLowerCase();
			let s = 0;
			if (/%/.test(t)) s += 3;
			if (/\d+\s*%/.test(t)) s += 3;
			if (/session|5\s*hour|5h/.test(t)) s += 2;
			if (/week|7\s*day|7d/.test(t)) s += 2;
			if (/reset/.test(t)) s += 2;
			if (/usage|limit/.test(t)) s += 1;
			return s;
		};

		out.popoverCandidates = popCandidates.slice(0, 8).map((el) => ({
			...describe(el),
			score: score(el),
			text: (el.textContent || '').trim().slice(0, 300)
		}));

		// 3. Best-looking panel gets a structural outline -- this is what we need to
		//    know where a "resets in ..." line can be inserted.
		let best = null, bestScore = -1;
		for (const el of popCandidates) {
			const s = score(el);
			if (s > bestScore) { bestScore = s; best = el; }
		}
		// Fallback: any visible element mentioning a percentage AND reset/session wording.
		if (bestScore < 4) {
			for (const el of document.querySelectorAll('div,section,aside')) {
				if (el.childElementCount > 30) continue;
				const r = el.getBoundingClientRect();
				if (r.width < 80 || r.height < 40) continue;
				const s = score(el);
				if (s > bestScore) { bestScore = s; best = el; }
			}
		}

		out.bestPanel = best ? { ...describe(best), score: bestScore, text: (best.textContent || '').trim().slice(0, 400) } : null;
		out.bestPanelOutline = best ? outline(best) : null;
		out.bestPanelParent = best ? describe(best.parentElement) : null;

		// 4. Extension state on this route.
		out.extension = {
			loaded: typeof globalThis.ClaudeCounter !== 'undefined',
			usageRowAttached: !!document.querySelector('[class*="cc-usageRow"]')
		};
		out.orgCookiePresent = /(^|;\s*)lastActiveOrg=/.test(document.cookie);

		return { out, bestScore };
	};

	let ticks = 0;
	const tick = () => {
		const { out, bestScore } = scan();
		if (bestScore > seen.bestScore) { seen.best = out; seen.bestScore = bestScore; }
		ticks++;
		if (ticks >= 10) {
			clearInterval(timer);
			const json = JSON.stringify(seen.best, null, 2);
			console.log('%c=== Claude Counter /code usage-popover diagnostic ===', 'font-weight:bold');
			console.log('best panel score:', seen.bestScore, seen.bestScore < 4 ? '(LOW - was the details box open?)' : '(looks like the usage panel)');
			console.log(json);
			try { copy(json); console.log('%cCopied to clipboard.', 'color:green'); } catch { console.log('(select the JSON above and copy it)'); }
		}
	};
	console.log('%cScanning for 10s -- make sure the usage details box is OPEN...', 'color:#2c84db');
	const timer = setInterval(tick, 1000);
	tick();
})();
