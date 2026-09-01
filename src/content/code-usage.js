(() => {
	'use strict';

	const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});

	const HOUR_MS = 60 * 60 * 1000;
	const DAY_MS = 24 * HOUR_MS;

	// Claude Code lives at /code and /code/session_<id>.
	function isCodeSurface(pathname = location.pathname) {
		return pathname === '/code' || pathname.startsWith('/code/');
	}

	// "5%" -> 5 ; "28%" -> 28 ; returns null when the row has no percentage.
	// Takes the LAST percentage in the row: the label may contain one (e.g. a
	// context line reading "197.6k / 1M (20%)").
	function parsePercent(text) {
		if (typeof text !== 'string') return null;
		const all = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
		if (!all.length) return null;
		const value = Number(all[all.length - 1][1]);
		return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
	}

	// The window a row is measuring, inferred from its label.
	function parseWindowMs(text) {
		if (typeof text !== 'string') return null;
		if (/\b5[-\s]?hour\b/i.test(text)) return 5 * HOUR_MS;
		if (/\bweekly\b|\b7[-\s]?day\b/i.test(text)) return 7 * DAY_MS;
		return null;
	}

	// "Resets in 4 hr 49 min" -> ms remaining. Also handles "in 32 min", "in 2 d 3 hr".
	function parseRelativeReset(text) {
		if (typeof text !== 'string') return null;
		const m = /resets?\s+in\s+([^,.]*)/i.exec(text);
		if (!m) return null;
		const spec = m[1];
		let ms = 0;
		let matched = false;
		const units = [
			[/(\d+)\s*d(?:ay)?s?(?![a-z])/i, DAY_MS],
			[/(\d+)\s*h(?:r|our)?s?(?![a-z])/i, HOUR_MS],
			[/(\d+)\s*m(?:in|inute)?s?(?![a-z])/i, 60 * 1000]
		];
		for (const [re, unit] of units) {
			const u = re.exec(spec);
			if (u) { ms += Number(u[1]) * unit; matched = true; }
		}
		return matched ? ms : null;
	}

	// "Resets Thu 8:00 PM" -> ms until the next such weekday/time from `now`.
	function parseAbsoluteReset(text, now = new Date()) {
		if (typeof text !== 'string') return null;
		const m = /resets?\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
		if (!m) return null;
		const days = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
		const target = days[m[1].toLowerCase()];
		let hour = Number(m[2]);
		const minute = m[3] ? Number(m[3]) : 0;
		const ampm = m[4] ? m[4].toLowerCase() : null;
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;

		const d = new Date(now);
		d.setHours(hour, minute, 0, 0);
		let delta = (target - d.getDay() + 7) % 7;
		d.setDate(d.getDate() + delta);
		if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
		return d.getTime() - now.getTime();
	}

	// How far through the window we are, 0..1 -- this is what the marker shows.
	function windowPosition(text, now = new Date()) {
		const windowMs = parseWindowMs(text);
		if (!windowMs) return null;
		const remaining = parseRelativeReset(text) ?? parseAbsoluteReset(text, now);
		if (remaining === null || !Number.isFinite(remaining)) return null;
		const clamped = Math.max(0, Math.min(windowMs, remaining));
		return 1 - clamped / windowMs;
	}


	// ---- injection -------------------------------------------------------

	const MARKER_ATTR = 'data-cc-window-marker';

	// Claude Code's usage popover. Matched on content, not just the attribute:
	// other popovers use the same component.
	function findUsagePopover() {
		for (const el of document.querySelectorAll('[data-cds="Popover"][role="dialog"]')) {
			if (/5-hour limit|Plan usage limits/i.test(el.textContent || '')) return el;
		}
		return null;
	}

	// Their bar sits in a row alongside the label and the reset text, so the row is
	// the nearest ancestor holding both.
	//
	// The ancestor must contain exactly ONE progressbar. Without that check the walk
	// climbs straight past a row that has no reset text -- the credits row -- and
	// matches the container holding every row, whose text belongs to a different
	// limit entirely. That mislabels the credits bar with the 5-hour window.
	function rowFor(bar) {
		let cur = bar.parentElement;
		for (let i = 0; i < 4 && cur; i++) {
			const bars = cur.querySelectorAll('[role="progressbar"]').length;
			if (bars > 1) return null;
			if (bars === 1 && /resets?\s/i.test(cur.textContent || '')) return cur;
			cur = cur.parentElement;
		}
		return null;
	}

	function markerColor(el) {
		// Their popover is themed; pick whichever of black/white reads on it.
		const bg = window.getComputedStyle(el).backgroundColor || '';
		const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
		if (!m) return 'rgba(255,255,255,0.9)';
		const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
	}

	function formatRemaining(ms) {
		const mins = Math.max(0, Math.round(ms / 60000));
		const d = Math.floor(mins / 1440);
		const h = Math.floor((mins % 1440) / 60);
		const m = mins % 60;
		if (d > 0) return `${d}d ${h}h`;
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	}

	// Add a marker showing how far through the reset window we are. Their bar
	// already shows usage; what it does not show is the pace to compare it against.
	function enhanceRow(bar) {
		const row = rowFor(bar);
		if (!row) return false;

		const text = row.textContent || '';
		const windowMs = parseWindowMs(text);
		if (!windowMs) return false; // credits + context rows have no window

		const now = new Date();
		const position = windowPosition(text, now);
		if (position === null) return false;

		const remaining = parseRelativeReset(text) ?? parseAbsoluteReset(text, now);
		const used = parsePercent(text);

		// An absolutely positioned child needs a positioned parent.
		if (window.getComputedStyle(bar).position === 'static') bar.style.position = 'relative';

		let marker = bar.querySelector(`[${MARKER_ATTR}]`);
		if (!marker) {
			marker = document.createElement('div');
			marker.setAttribute(MARKER_ATTR, '');
			marker.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;pointer-events:none;border-radius:1px;';
			bar.appendChild(marker);
		}
		marker.style.left = `calc(${(position * 100).toFixed(2)}% - 1px)`;
		marker.style.background = markerColor(bar.closest('[data-cds="Popover"]') || bar);

		const pct = (position * 100).toFixed(0);
		const pace = used === null ? '' :
			used > position * 100 ? ' — ahead of pace' :
			used < position * 100 ? ' — under pace' : '';
		marker.title = `${pct}% through the window` +
			(remaining !== null ? `, ${formatRemaining(remaining)} left` : '') + pace;
		return true;
	}

	function enhancePopover(pop) {
		let n = 0;
		for (const bar of pop.querySelectorAll('[role="progressbar"]')) {
			try { if (enhanceRow(bar)) n++; } catch (err) { /* one bad row must not kill the rest */ }
		}
		return n;
	}

	let refreshTimer = null;

	function sweep() {
		if (!isCodeSurface()) return;
		const pop = findUsagePopover();
		if (!pop) {
			if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
			return;
		}
		const n = enhancePopover(pop);
		if (!n) {
			CC.warnOnce?.('code:usage-marker', 'usage popover found but no row exposed a reset window to mark');
		} else if (!refreshTimer) {
			// The popover stays open while you read it; keep the marker honest.
			refreshTimer = setInterval(() => {
				const still = findUsagePopover();
				if (still) enhancePopover(still);
				else { clearInterval(refreshTimer); refreshTimer = null; }
			}, 30000);
		}
	}

	function start() {
		if (!isCodeSurface()) return;
		let queued = false;
		const observer = new MutationObserver(() => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(() => { queued = false; sweep(); });
		});
		observer.observe(document.body, { childList: true, subtree: true });
		sweep();
	}

	CC.codeUsage = {
		isCodeSurface, parsePercent, parseWindowMs, parseRelativeReset, parseAbsoluteReset,
		windowPosition, formatRemaining, findUsagePopover, rowFor, enhanceRow, enhancePopover,
		start, HOUR_MS, DAY_MS
	};

	if (typeof document !== 'undefined' && document.body) start();
	else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', start, { once: true });
})();
