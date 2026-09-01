/*
 * Claude Counter — DOM diagnostic
 *
 * claude.ai renames its data-testids without notice, and every attach path in
 * the extension fails by returning early, so a broken selector looks identical
 * to "nothing happened". Paste this into the devtools console ON claude.ai
 * (open a conversation first) and share the output; it says which anchors the
 * current layout actually exposes.
 *
 * Reads only. Changes nothing.
 */
(() => {
	const out = { url: location.pathname, ts: new Date().toISOString() };

	const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch { return 'BAD-SELECTOR'; } };

	// 1. Do the anchors the extension looks for still exist?
	out.selectors = {};
	[
		'[data-testid="chat-menu-trigger"]',      // pre-redesign title button
		'[data-testid="chat-title-split"]',       // post-redesign title
		'[data-testid="chat-header"]',
		'[data-testid="model-selector-dropdown"]',
		'[data-testid="chat-input-grid-container"]',
		'[data-testid="chat-input-grid-area"]',
		'.chat-project-wrapper',
		'button:has(span.font-base-bold)'
	].forEach((s) => { out.selectors[s] = count(s); });

	// 2. The Chat/Cowork switch — find it by label, since we don't know its testid.
	out.cowork = [...document.querySelectorAll('button,a,[role="tab"],[role="radio"]')]
		.filter((el) => /^(chat|cowork)$/i.test((el.textContent || '').trim()))
		.map((el) => ({
			text: el.textContent.trim(),
			tag: el.tagName.toLowerCase(),
			role: el.getAttribute('role'),
			testid: el.getAttribute('data-testid'),
			cls: (el.className || '').toString().slice(0, 120),
			parentTestid: el.parentElement?.getAttribute('data-testid'),
			parentCls: (el.parentElement?.className || '').toString().slice(0, 120)
		}));

	// 3. Ancestor chain above the model selector, with the properties that decide
	//    whether inserting after an element is safe (out-of-flow == never safe).
	const describe = (el) => {
		const cs = getComputedStyle(el);
		return {
			tag: el.tagName.toLowerCase(),
			testid: el.getAttribute('data-testid'),
			cls: (el.className || '').toString().slice(0, 100),
			position: cs.position,
			display: cs.display,
			flexDirection: cs.flexDirection,
			overflow: cs.overflow,
			buttons: el.querySelectorAll('button').length
		};
	};

	const ms = document.querySelector('[data-testid="model-selector-dropdown"]');
	out.modelSelectorChain = [];
	if (ms) {
		let cur = ms, depth = 0;
		while (cur && cur !== document.body && depth < 12) { out.modelSelectorChain.push(describe(cur)); cur = cur.parentElement; depth++; }
	} else { out.modelSelectorChain = 'MODEL SELECTOR NOT FOUND'; }

	// 4. Same for the chat title, to see what the header row looks like.
	const title = document.querySelector('[data-testid="chat-title-split"], [data-testid="chat-menu-trigger"], button:has(span.font-base-bold)');
	out.titleChain = [];
	if (title) {
		let cur = title, depth = 0;
		while (cur && cur !== document.body && depth < 8) { out.titleChain.push(describe(cur)); cur = cur.parentElement; depth++; }
	} else { out.titleChain = 'CHAT TITLE NOT FOUND'; }

	// 5. Did our own UI attach, and where did it land?
	const cc = { header: document.querySelector('.cc-header, [class*="cc-header"]'), usage: document.querySelector('[class*="cc-usageRow"]') };
	out.injected = {
		headerAttached: !!cc.header,
		headerParent: cc.header ? describe(cc.header.parentElement) : null,
		usageAttached: !!cc.usage,
		usageParent: cc.usage ? describe(cc.usage.parentElement) : null,
		usageRect: cc.usage ? cc.usage.getBoundingClientRect().toJSON() : null
	};

	console.log('%c=== Claude Counter diagnostic ===', 'font-weight:bold');
	console.log(JSON.stringify(out, null, 2));
	try { copy(JSON.stringify(out, null, 2)); console.log('%cCopied to clipboard.', 'color:green'); } catch { console.log('(select the JSON above and copy it)'); }
	return out;
})();
