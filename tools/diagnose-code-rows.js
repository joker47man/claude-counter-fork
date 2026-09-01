/*
 * Claude Counter — claude.ai/code usage-row diagnostic  (v0.6, pass 2)
 *
 * The popover is [data-cds="Popover"][role="dialog"]. Its limit rows sit in a
 * container we did not capture last time. This dumps that subtree in full so a
 * progress bar can be inserted into each row without guessing.
 *
 * HOW TO RUN: on https://claude.ai/code with the usage details box OPEN.
 * Scans for 10s. Reads only. No network calls. No cookie/token values.
 */
(() => {
	const full = (el, depth = 0, maxDepth = 8, acc = []) => {
		if (!el || depth > maxDepth) return acc;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		const ownText = [...el.childNodes]
			.filter((n) => n.nodeType === 3)
			.map((n) => n.textContent.trim())
			.filter(Boolean).join(' ').slice(0, 90);
		acc.push({
			d: depth,
			tag: el.tagName.toLowerCase(),
			cds: el.getAttribute('data-cds') || undefined,
			testid: el.getAttribute('data-testid') || undefined,
			role: el.getAttribute('role') || undefined,
			aria: el.getAttribute('aria-label') || undefined,
			cls: (el.className || '').toString().slice(0, 130) || undefined,
			text: ownText || undefined,
			display: cs.display,
			flexDir: cs.flexDirection,
			position: cs.position,
			w: Math.round(r.width),
			h: Math.round(r.height),
			kids: el.childElementCount
		});
		[...el.children].forEach((c) => full(c, depth + 1, maxDepth, acc));
		return acc;
	};

	const grab = () => {
		const pop = [...document.querySelectorAll('[data-cds="Popover"][role="dialog"]')]
			.find((el) => /5-hour limit|Plan usage limits|Weekly/i.test(el.textContent || ''));
		if (!pop) return null;

		// The section holding the limit rows: the block that mentions the 5-hour limit.
		const section = [...pop.querySelectorAll('div')]
			.filter((el) => /5-hour limit/i.test(el.textContent || ''))
			.sort((a, b) => a.textContent.length - b.textContent.length)[0] || pop;

		return {
			url: location.pathname,
			ts: new Date().toISOString(),
			popoverClass: (pop.className || '').toString(),
			popoverRect: (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(pop.getBoundingClientRect()),
			// Full subtree of the whole popover, so nothing is missed.
			popoverTree: full(pop),
			// The narrowest element still containing every limit row.
			rowsSectionText: (section.textContent || '').trim().slice(0, 400),
			rowsSectionTree: full(section),
			// Existing CSS custom properties, so injected bars can match the theme.
			themeVars: (() => {
				const cs = getComputedStyle(pop);
				const out = {};
				for (const k of ['--df-row-font', 'color', 'background-color', 'font-family', 'font-size']) out[k] = cs.getPropertyValue(k);
				return out;
			})()
		};
	};

	let n = 0;
	const t = setInterval(() => {
		const g = grab();
		n++;
		if (g || n >= 10) {
			clearInterval(t);
			if (!g) { console.warn('Usage popover not found — is the details box open?'); return; }
			const json = JSON.stringify(g, null, 2);
			console.log('%c=== Claude Counter /code rows diagnostic ===', 'font-weight:bold');
			console.log(json);
			try { copy(json); console.log('%cCopied to clipboard.', 'color:green'); } catch { console.log('(copy the JSON above)'); }
		}
	}, 1000);
	console.log('%cScanning 10s — keep the usage details box OPEN...', 'color:#2c84db');
})();
