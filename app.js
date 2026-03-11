/**
 * Flipatic — Text to Speech Editor Prototype
 * Word-level modifier system with context menu.
 */

// ============================================
// Modifier Configuration
// ============================================

const MODIFIERS = {
  pause: { label: 'Pause' },
  accent: { label: 'Emphasis' },
  sayas: { label: 'Pronounce as' },
};

const MOD_ORDER = ['pause', 'accent', 'sayas'];

// Color mapping per modifier type (from Figma tokens)
const MOD_COLORS = {
  pause: [249, 115, 22],   // #f97316 — tag/warning/tag-orange-icon
  accent: [192, 132, 252],  // #c084fc — tag/purple/tag-purple-icon
  sayas: [59, 130, 246],    // #3b82f6 — tag/blue/tag-blue-icon
};

// ============================================
// DOM References
// ============================================

const $slidesArea = document.getElementById('slidesArea');
const $ctxWrap = document.getElementById('ctxWrap');
const $panelMain = document.getElementById('panelMain');
const $subPause = document.getElementById('subPause');
const $subTone = document.getElementById('subTone');
const $subSayAs = document.getElementById('subSayAs');
const $subSayAsLangs = document.getElementById('subSayAsLangs');
const $btnSelectLang = document.getElementById('btnSelectLang');
const $saInput = document.getElementById('saInput');
const $btnSaApply = document.getElementById('btnSaApply');
const $menuWordLabel = document.getElementById('menuWordLabel');
const $salSearch = document.getElementById('salSearch');
const $salList = document.getElementById('salList');

const SUB_PANELS = [$subPause, $subTone, $subSayAs, $subSayAsLangs];

// ============================================
// State
// ============================================

let savedSelection = null;
let targetModifierWord = null;
let ignoreInput = false;
const slideTextDirty = {};
const slideModsSnapshot = {};
const slideOriginalHTML = {};
let activeToastSlide = null;

// ============================================
// SVG Templates
// ============================================

const ICON_CLOSE = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// ============================================
// Fuzzy Search
// ============================================

function fuzzyMatch(query, text) {
  query = query.toLowerCase();
  text = text.toLowerCase();
  if (text.includes(query)) return { match: true, score: 100 };
  let qi = 0, score = 0, lastIdx = -1;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      score += 10;
      if (lastIdx === ti - 1) score += 5;
      if (ti === 0 || text[ti - 1] === ' ') score += 8;
      lastIdx = ti;
      qi++;
    }
  }
  return { match: qi === query.length, score };
}

// ============================================
// Helpers
// ============================================

function getWordText(mwEl) {
  let text = '';
  for (const node of mwEl.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  }
  return text.trim();
}

function findEditorFromNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  return node ? node.closest('.te') : null;
}

function findSlideCard(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  return node ? node.closest('.slide-card') : null;
}

// ============================================
// Context Menu — Positioning
// ============================================

function adjustMenuPosition() {
  const rect = $ctxWrap.getBoundingClientRect();
  let x = parseFloat($ctxWrap.style.left);
  let y = parseFloat($ctxWrap.style.top);

  if (rect.right > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;

  // Check if menu overflows bottom
  const overflowBottom = rect.bottom > window.innerHeight - 12;
  if (overflowBottom) y -= rect.bottom - window.innerHeight + 16;
  if (x < 12) x = 12;
  if (y < 12) y = 12;

  // Align sub-panels to bottom edge when pushed up, so they don't stack upward
  $ctxWrap.style.alignItems = overflowBottom ? 'flex-end' : 'flex-start';

  $ctxWrap.style.left = x + 'px';
  $ctxWrap.style.top = y + 'px';
}

// ============================================
// Context Menu — Visibility
// ============================================

function closeSubPanels(instant) {
  for (const panel of SUB_PANELS) {
    if (!instant && panel.classList.contains('vis')) {
      panel.classList.remove('vis');
      panel.classList.add('closing');
      const p = panel;
      setTimeout(() => {
        p.classList.remove('closing');
        p.style.display = 'none';
        p.style.marginTop = '';
        p.style.alignSelf = '';
      }, 120);
    } else {
      panel.classList.remove('vis', 'closing');
      panel.style.display = 'none';
      panel.style.marginTop = '';
      panel.style.alignSelf = '';
    }
  }
  for (const el of $ctxWrap.querySelectorAll('.active-path')) {
    el.classList.remove('active-path');
  }
}

function hideMenu() {
  if ($panelMain.classList.contains('vis')) {
    $panelMain.classList.remove('vis');
    $panelMain.classList.add('closing');
    setTimeout(() => {
      $panelMain.classList.remove('closing');
      $ctxWrap.classList.remove('visible');
    }, 120);
  } else {
    $ctxWrap.classList.remove('visible');
  }
  closeSubPanels();
}

function resetMenuState() {
  hideMenu();
  savedSelection = null;
  targetModifierWord = null;
}

function openSubPanel(panel, triggerEl) {
  closeSubPanels(true);

  // Show panel off-screen to measure first item offset
  panel.style.display = 'block';

  const wrapRect = $ctxWrap.getBoundingClientRect();
  let offsetTop = 0;

  if (triggerEl) {
    const triggerRect = triggerEl.getBoundingClientRect();
    const firstItem = panel.querySelector('.a-item');
    const firstItemOffset = firstItem
      ? firstItem.getBoundingClientRect().top - panel.getBoundingClientRect().top
      : 0;

    offsetTop = triggerRect.top - wrapRect.top - firstItemOffset;
    if (offsetTop < 0) offsetTop = 0;

    // Dynamic transform-origin: scale from where trigger is
    panel.style.setProperty('--origin', `left ${triggerRect.top - wrapRect.top - offsetTop}px`);
  }
  panel.style.marginTop = offsetTop + 'px';
  panel.style.alignSelf = 'flex-start';

  // Cap sub-panel height to available viewport space
  const availBelow = window.innerHeight - wrapRect.top - offsetTop - 12;
  panel.style.maxHeight = Math.max(availBelow, 150) + 'px';

  requestAnimationFrame(() => {
    panel.classList.add('vis');
    const rect = $ctxWrap.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
      let x = parseFloat($ctxWrap.style.left);
      x = window.innerWidth - rect.width - 12;
      if (x < 12) x = 12;
      $ctxWrap.style.left = x + 'px';
    }
  });
}

// ============================================
// Context Menu — Build & Open
// ============================================

function buildMainPanel(word, mwEl) {
  const mods = mwEl ? JSON.parse(mwEl.dataset.mods || '[]') : [];
  const modsByType = {};
  for (const mod of mods) modsByType[mod.type] = mod;

  $menuWordLabel.textContent = 'Voice settings';

  for (const item of $panelMain.querySelectorAll('[data-action]')) {
    const type = item.dataset.action;
    const activeMod = modsByType[type];

    // Remove old actions group
    const oldActions = item.querySelector('.ctx-v2-actions');
    if (oldActions) oldActions.remove();

    // Show/hide chevron
    const chevron = item.querySelector('.ctx-v2-chevron');

    if (activeMod) {
      const displayValue = activeMod.badge || activeMod.value;
      if (chevron) chevron.style.display = 'none';

      const actionsEl = document.createElement('span');
      actionsEl.className = 'ctx-v2-actions';

      const valEl = document.createElement('span');
      valEl.className = 'ctx-v2-val';

      const valText = document.createElement('span');
      valText.className = 'ctx-v2-val-text';
      valText.textContent = displayValue;
      valEl.appendChild(valText);

      const removeEl = document.createElement('button');
      removeEl.className = 'ctx-v2-remove';
      removeEl.dataset.remove = type;
      removeEl.innerHTML = ICON_CLOSE;
      valEl.appendChild(removeEl);

      actionsEl.appendChild(valEl);
      item.appendChild(actionsEl);
    } else {
      if (chevron) chevron.style.display = '';
    }
  }
}

function openMenu(x, yBelow, word, mwEl, yAbove) {
  hideMenu();
  buildMainPanel(word, mwEl);

  $panelMain.style.setProperty('--origin', 'top left');

  $ctxWrap.style.left = x + 'px';
  $ctxWrap.style.top = yBelow + 'px';
  $ctxWrap.style.alignItems = 'flex-start';
  $ctxWrap.classList.add('visible');

  requestAnimationFrame(() => {
    $panelMain.classList.add('vis');

    const panelHeight = $panelMain.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - yBelow - 12;

    if (panelHeight > spaceBelow && yAbove !== undefined) {
      $ctxWrap.style.top = (yAbove - panelHeight) + 'px';
      $panelMain.style.setProperty('--origin', 'bottom left');
    }

    adjustMenuPosition();
  });
}

// ============================================
// Modifier Word — DOM Construction
// ============================================

function createModifierWord(text, mods) {
  const el = document.createElement('span');
  el.className = 'mw';
  el.dataset.mods = JSON.stringify(mods);
  renderModifierWordContent(el, text, mods);
  return el;
}

function renderModifierWordContent(el, text, mods) {
  el.appendChild(document.createTextNode(text));

  // Underline bar (supports gradient for multi-modifier)
  const line = document.createElement('span');
  line.className = 'mw-line';
  line.setAttribute('contenteditable', 'false');
  el.appendChild(line);

  // Apply dynamic colors based on active modifier types
  applyModifierColors(el, mods);

  el.dataset.tip = mods
    .map((m) => {
      const label = MODIFIERS[m.type]?.label || m.type;
      const val = m.badge || m.value;
      return val && val !== 'On' ? `${label}: ${val}` : label;
    })
    .join(' \u00B7 ');
}

/** Set background tint and underline color(s) on a modifier word element. */
function applyModifierColors(el, mods) {
  // Collect unique colors in MOD_ORDER to keep gradient consistent
  const colors = [];
  for (const type of MOD_ORDER) {
    if (mods.some((m) => m.type === type) && MOD_COLORS[type]) {
      colors.push(MOD_COLORS[type]);
    }
  }

  if (colors.length === 0) return;

  const line = el.querySelector('.mw-line');

  if (colors.length === 1) {
    const [r, g, b] = colors[0];
    el.style.background = `rgba(${r},${g},${b},0.15)`;
    if (line) line.style.background = `rgb(${r},${g},${b})`;
  } else {
    const bgStops = colors.map(([r, g, b]) => `rgba(${r},${g},${b},0.15)`).join(', ');
    const lineStops = colors.map(([r, g, b]) => `rgb(${r},${g},${b})`).join(', ');
    el.style.background = `linear-gradient(to right, ${bgStops})`;
    if (line) line.style.background = `linear-gradient(to right, ${lineStops})`;
  }
}

function refreshModifierWord(mwEl) {
  const mods = JSON.parse(mwEl.dataset.mods || '[]');
  const text = getWordText(mwEl);

  if (mods.length === 0) {
    const parentEditor = findEditorFromNode(mwEl);
    mwEl.replaceWith(document.createTextNode(text));
    if (parentEditor) parentEditor.normalize();
    return;
  }

  mwEl.innerHTML = '';
  renderModifierWordContent(mwEl, text, mods);
}

// ============================================
// Core: Apply Modifier
// ============================================

function applyModifier(type, value, badge) {
  if (targetModifierWord) {
    const mods = JSON.parse(targetModifierWord.dataset.mods || '[]');
    const mod = { type, value };
    if (badge) mod.badge = badge;

    const idx = mods.findIndex((m) => m.type === type);
    if (idx >= 0) mods[idx] = mod;
    else mods.push(mod);

    ignoreInput = true;
    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);
    ignoreInput = false;

    updateSlideFromContent(findSlideCard(targetModifierWord));
    closeSubPanels();
    buildMainPanel(getWordText(targetModifierWord), targetModifierWord);
    return;
  }

  if (!savedSelection || !savedSelection.range) return;

  const { range, text } = savedSelection;
  const mod = { type, value };
  if (badge) mod.badge = badge;

  ignoreInput = true;
  const mwEl = createModifierWord(text, [mod]);
  range.deleteContents();
  range.insertNode(mwEl);

  if (!mwEl.nextSibling) {
    mwEl.after(document.createTextNode('\u00A0'));
  }
  ignoreInput = false;

  window.getSelection().removeAllRanges();
  updateSlideFromContent(findSlideCard(mwEl));
  targetModifierWord = mwEl;
  savedSelection = { existingEl: mwEl, text: getWordText(mwEl) };
  closeSubPanels();
  buildMainPanel(getWordText(mwEl), mwEl);
}

// ============================================
// Event: Text Selection → Open Menu
// ============================================

$slidesArea.addEventListener('mouseup', (e) => {
  if (e.target.closest('.mw')) return;

  const editor = e.target.closest('.te');
  if (!editor) return;

  const sel = window.getSelection();
  const text = sel.toString().trim();
  if (!text) return;
  if (!editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) return;
  if (/\s/.test(text)) return;

  // Only allow full-word selections — check chars before and after
  const range = sel.getRangeAt(0);
  const parentText = range.startContainer.textContent || '';
  const charBefore = parentText[range.startOffset - 1] || '';
  const endText = range.endContainer.textContent || '';
  const charAfter = endText[range.endOffset] || '';
  const wordBoundary = /^[\s.,;:!?'"()\-–—\u00A0]*$/;
  if (charBefore && !wordBoundary.test(charBefore)) return;
  if (charAfter && !wordBoundary.test(charAfter)) return;

  savedSelection = { range: range.cloneRange(), text };
  targetModifierWord = null;

  const rect = range.getBoundingClientRect();
  openMenu(rect.left, rect.bottom + 8, text, null, rect.top - 8);
});

// ============================================
// Event: Click Existing Modifier Word
// ============================================

$slidesArea.addEventListener('click', (e) => {
  const mwEl = e.target.closest('.mw');
  if (!mwEl) return;
  if (!mwEl.closest('.te')) return;
  if (window.getSelection().toString().trim()) return;

  e.stopPropagation();
  targetModifierWord = mwEl;
  savedSelection = { existingEl: mwEl, text: getWordText(mwEl) };

  const rect = mwEl.getBoundingClientRect();
  openMenu(rect.left, rect.bottom + 8, getWordText(mwEl), mwEl, rect.top - 8);
});

// ============================================
// Event: Main Menu Item Clicks
// ============================================

$panelMain.addEventListener('click', (e) => {
  // Handle remove button
  const removeBtn = e.target.closest('.ctx-v2-remove');
  if (removeBtn && targetModifierWord) {
    e.stopPropagation();
    const type = removeBtn.dataset.remove;
    const mods = JSON.parse(targetModifierWord.dataset.mods || '[]');
    const idx = mods.findIndex((m) => m.type === type);
    if (idx >= 0) mods.splice(idx, 1);

    const card = findSlideCard(targetModifierWord);
    const wordText = getWordText(targetModifierWord);

    if (mods.length === 0) {
      // Last modifier removed — unwrap .mw but keep selection for re-adding
      const textNode = document.createTextNode(wordText);
      ignoreInput = true;
      targetModifierWord.replaceWith(textNode);
      ignoreInput = false;

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, wordText.length);

      targetModifierWord = null;
      savedSelection = { range, text: wordText };
      closeSubPanels();
      buildMainPanel(wordText, null);
      updateSlideFromContent(card);
      return;
    }

    ignoreInput = true;
    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);
    ignoreInput = false;

    closeSubPanels();
    buildMainPanel(wordText, targetModifierWord);

    updateSlideFromContent(card);
    return;
  }

  const item = e.target.closest('[data-action]');
  if (!item) return;

  const type = item.dataset.action;

  if (type === 'pause') {
    openSubPanel($subPause, item);
    item.classList.add('active-path');
    return;
  }

  if (type === 'accent') {
    openSubPanel($subTone, item);
    item.classList.add('active-path');
  } else if (type === 'sayas') {
    openSubPanel($subSayAs, item);
    item.classList.add('active-path');
    $saInput.value = '';
    $btnSaApply.classList.add('hidden');
  }
});

// ============================================
// Event: Sub-panel — Pause
// ============================================

$subPause.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pause]');
  if (btn && savedSelection) {
    const position = btn.dataset.pause; // "before" or "after"
    const dur = btn.dataset.dur;        // "0.5" or "1.0"
    const posLabel = position === 'before' ? 'Before' : 'After';
    const durLabel = dur === '0.3' ? 'Short' : 'Long';
    const badge = `${posLabel} · ${durLabel}`;
    applyModifier('pause', `${position}:${dur}`, badge);
  }
});

// ============================================
// Event: Sub-panel — Tone
// ============================================

$subTone.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tone]');
  if (btn && savedSelection) {
    applyModifier('accent', btn.dataset.tone, btn.dataset.tone);
  }
});

// ============================================
// Event: Sub-panel — Say As
// ============================================

// Open level 3: language list (alongside level 2)
$btnSelectLang.addEventListener('click', () => {
  $saInput.blur();

  // Reset search on open
  $salSearch.value = '';
  $salSearch.dispatchEvent(new Event('input'));

  // Show panel to measure offset
  $subSayAsLangs.style.display = 'flex';

  const wrapRect = $ctxWrap.getBoundingClientRect();
  const sayAsRect = $subSayAs.getBoundingClientRect();

  // Align Level 3 top with Level 2 top
  let offsetTop = sayAsRect.top - wrapRect.top;
  if (offsetTop < 0) offsetTop = 0;
  $subSayAsLangs.style.marginTop = offsetTop + 'px';
  $subSayAsLangs.style.alignSelf = 'flex-start';

  const availHeight = window.innerHeight - wrapRect.top - offsetTop - 12;
  $subSayAsLangs.style.maxHeight = Math.min(460, Math.max(availHeight, 150)) + 'px';
  $subSayAsLangs.style.setProperty('--origin', 'top left');

  $btnSelectLang.classList.add('active-path');
  requestAnimationFrame(() => {
    $subSayAsLangs.classList.add('vis');
    const rect = $ctxWrap.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
      let x = parseFloat($ctxWrap.style.left);
      x = window.innerWidth - rect.width - 12;
      if (x < 12) x = 12;
      $ctxWrap.style.left = x + 'px';
    }
  });
});

// Level 3: language/accent selection
$subSayAsLangs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sal]');
  if (!btn || !savedSelection) return;

  const group = btn.closest('.sal-group');
  const langName = group?.querySelector('.sal-lang-name');
  let badge;

  if (langName && btn.classList.contains('sal-accent')) {
    // Accent item — show "Flag Language, Accent"
    const lang = langName.textContent.trim();
    badge = lang + ', ' + btn.textContent.trim();
  } else {
    badge = btn.textContent.trim();
  }

  applyModifier('sayas', 'lang:' + btn.dataset.sal, badge);
});

// Level 3: fuzzy search filtering
$salSearch.addEventListener('input', () => {
  const q = $salSearch.value.trim();
  const groups = $salList.querySelectorAll('.sal-group');
  let anyVisible = false;

  if (!q) {
    for (const group of groups) {
      group.style.display = '';
      const langNameEl = group.querySelector('.sal-lang-name');
      if (langNameEl) langNameEl.style.display = '';
      for (const a of group.querySelectorAll('.sal-accent')) a.style.display = '';
      const singleItem = group.querySelector('.a-item:not(.sal-accent)');
      if (singleItem) singleItem.style.display = '';
    }
    anyVisible = true;
  } else {
    for (const group of groups) {
      const lang = group.dataset.lang || '';
      const accents = [...group.querySelectorAll('.sal-accent')];
      const langNameEl = group.querySelector('.sal-lang-name');
      const singleItem = group.querySelector('.a-item:not(.sal-accent)');

      const langResult = fuzzyMatch(q, lang);

      if (accents.length > 0) {
        let groupVisible = false;
        for (const a of accents) {
          const accentResult = fuzzyMatch(q, a.textContent);
          const show = langResult.match || accentResult.match;
          a.style.display = show ? '' : 'none';
          if (show) groupVisible = true;
        }
        group.style.display = groupVisible ? '' : 'none';
        if (langNameEl) langNameEl.style.display = groupVisible ? '' : 'none';
        if (groupVisible) anyVisible = true;
      } else if (singleItem) {
        const itemResult = fuzzyMatch(q, singleItem.textContent);
        const match = langResult.match || itemResult.match;
        group.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      }
    }
  }

  const noResults = $salList.querySelector('.sal-no-results');
  if (noResults) noResults.style.display = anyVisible ? 'none' : '';
});

$btnSaApply.addEventListener('click', () => {
  const value = $saInput.value.trim();
  if (value && savedSelection) {
    applyModifier('sayas', value);
  }
});

$saInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $btnSaApply.click();
  }
});

// Show/hide Apply button based on input value
$saInput.addEventListener('input', () => {
  $btnSaApply.classList.toggle('hidden', !$saInput.value.trim());
});

// ============================================
// Event: Prevent Selection Loss on Menu Click
// ============================================

$ctxWrap.addEventListener('mousedown', (e) => {
  // Allow focus on interactive elements, prevent elsewhere to keep text selection
  if (e.target === $saInput) {
    // Hide level 3 when clicking input in level 2
    $subSayAsLangs.classList.remove('vis');
    $subSayAsLangs.style.display = 'none';
    $btnSelectLang.classList.remove('active-path');
    return;
  }
  if (e.target === $salSearch) return;
  e.preventDefault();
});

// ============================================
// Event: Close Menu on Outside Click / Escape
// ============================================

document.addEventListener('mousedown', (e) => {
  if (!$ctxWrap.contains(e.target) && $ctxWrap.classList.contains('visible')) resetMenuState();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') resetMenuState();
});

// ============================================
// Tabs (Preview / Scenario)
// ============================================

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
    tab.classList.add('active');
    resetMenuState();
  });
}

// ============================================
// Slide State Management
// ============================================

const SVG_PLAY = '<svg viewBox="0 0 16 16"><path d="M5.3 3.3l6.7 4.7-6.7 4.7V3.3z" fill="currentColor" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_DOTS = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="0.67" stroke="currentColor" stroke-width="1.33" fill="none"/><circle cx="12.67" cy="8" r="0.67" stroke="currentColor" stroke-width="1.33" fill="none"/><circle cx="3.33" cy="8" r="0.67" stroke="currentColor" stroke-width="1.33" fill="none"/></svg>';
const SVG_REGENERATE = '<svg viewBox="0 0 16 16"><path d="M1.3 8a6.7 6.7 0 0 1 11.5-4.7L14 4.7M14 1.3v3.4h-3.3M14.7 8a6.7 6.7 0 0 1-11.5 4.7L2 11.3M2 14.7v-3.4h3.3" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

function setSlideState(card, state) {
  if (card.dataset.state === state) return;
  card.dataset.state = state;

  const badges = card.querySelector('.slide-badges');
  const actions = card.querySelector('.slide-actions');
  const time = card.dataset.time || '0:00';

  // Update badges
  const warnBadge = badges.querySelector('.badge-warning');
  const errBadge = badges.querySelector('.badge-error');

  if (state === 'text-changed') {
    if (errBadge) errBadge.remove();
    if (!warnBadge) {
      const b = document.createElement('span');
      b.className = 'badge badge-warning';
      b.textContent = 'Text changed';
      badges.appendChild(b);
    }
  } else if (state === 'has-audio') {
    if (warnBadge) warnBadge.remove();
    if (errBadge) errBadge.remove();
  }

  // Update actions
  if (state === 'has-audio') {
    actions.innerHTML =
      `<button class="btn-icon btn-play">${SVG_PLAY}</button>` +
      `<div class="slide-time"><span class="time-current">0:00</span><span class="time-sep">/</span><span class="time-total">${time}</span></div>` +
      `<div class="separator-v"></div>` +
      `<button class="btn-icon">${SVG_DOTS}</button>`;
  } else if (state === 'text-changed') {
    actions.innerHTML =
      `<button class="btn-ghost">${SVG_REGENERATE} Regenerate Audio</button>` +
      `<div class="separator-v"></div>` +
      `<button class="btn-icon">${SVG_DOTS}</button>`;
  }
}

/** Serialize current modifier state of a slide for comparison. */
function getModifierSnapshot(card) {
  const te = card.querySelector('.te');
  if (!te) return '';
  const mws = [...te.querySelectorAll('.mw')];
  return mws.map((mw) => getWordText(mw) + ':' + (mw.dataset.mods || '[]')).join('|');
}

/** Re-evaluate slide state based on modifiers + manual edits. */
function updateSlideFromContent(card) {
  if (!card || card.dataset.state === 'no-audio') return;

  const slideId = card.dataset.slide;
  const dirty = slideTextDirty[slideId] || false;
  const currentSnap = getModifierSnapshot(card);
  const savedSnap = slideModsSnapshot[slideId] || '';
  const modsChanged = currentSnap !== savedSnap;

  if (dirty || modsChanged) {
    if (card.dataset.state !== 'text-changed') {
      setSlideState(card, 'text-changed');
    }
  } else {
    if (card.dataset.state === 'text-changed') {
      setSlideState(card, 'has-audio');
    }
  }
}

// ============================================
// Event: Manual Text Editing → Text Changed
// ============================================

/** Find the .mw element from current selection, if any. */
function findMwFromSelection() {
  const sel = window.getSelection();
  if (!sel.anchorNode) return null;
  const node = sel.anchorNode.nodeType === Node.TEXT_NODE
    ? sel.anchorNode.parentElement : sel.anchorNode;
  return node?.closest('.mw') || null;
}

/** Remove a single letter from a modifier word, or destroy it if empty. */
function trimModifierWord(mw, fromEnd) {
  const text = getWordText(mw);
  if (text.length <= 1) {
    const card = findSlideCard(mw);
    const parentEditor = findEditorFromNode(mw);
    ignoreInput = true;
    mw.replaceWith(document.createTextNode(''));
    if (parentEditor) parentEditor.normalize();
    ignoreInput = false;
    updateSlideFromContent(card);
  } else {
    const newText = fromEnd ? text.slice(0, -1) : text.slice(1);
    const mods = JSON.parse(mw.dataset.mods || '[]');
    ignoreInput = true;
    mw.innerHTML = '';
    renderModifierWordContent(mw, newText, mods);
    ignoreInput = false;
    updateSlideFromContent(findSlideCard(mw));
  }
}

// Monitor edits inside modifier words — update tooltip, remove when empty
$slidesArea.addEventListener('input', (e) => {
  if (ignoreInput) return;
  const mw = e.target.closest?.('.mw') || findMwFromSelection();
  if (!mw) return;

  const text = getWordText(mw);
  if (!text) {
    const card = findSlideCard(mw);
    const parentEditor = findEditorFromNode(mw);
    ignoreInput = true;
    mw.replaceWith(document.createTextNode(''));
    if (parentEditor) parentEditor.normalize();
    ignoreInput = false;
    updateSlideFromContent(card);
    return;
  }

  // Space inside modifier word — remove modifier, keep text
  if (/\s/.test(text)) {
    const card = findSlideCard(mw);
    const parentEditor = findEditorFromNode(mw);
    const textNode = document.createTextNode(text);
    ignoreInput = true;
    mw.replaceWith(textNode);
    if (parentEditor) parentEditor.normalize();
    ignoreInput = false;
    updateSlideFromContent(card);
    return;
  }

  // Refresh tooltip with new text
  const mods = JSON.parse(mw.dataset.mods || '[]');
  mw.dataset.tip = mods
    .map((m) => {
      const label = MODIFIERS[m.type]?.label || m.type;
      const val = m.badge || m.value;
      return val && val !== 'On' ? `${label}: ${val}` : label;
    })
    .join(' \u00B7 ');
});

// Backspace/Delete adjacent to modifier words — remove one letter at a time
$slidesArea.addEventListener('keydown', (e) => {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;

  const sel = window.getSelection();
  if (!sel.isCollapsed || !sel.anchorNode) return;

  const anchor = sel.anchorNode;
  const offset = sel.anchorOffset;
  let mw = null;

  if (e.key === 'Backspace') {
    if (anchor.nodeType === Node.TEXT_NODE && offset === 0) {
      const prev = anchor.previousSibling;
      if (prev && prev.classList?.contains('mw')) mw = prev;
    } else if (anchor.nodeType === Node.ELEMENT_NODE) {
      const child = anchor.childNodes[offset - 1];
      if (child && child.classList?.contains('mw')) mw = child;
    }
    if (!mw) return;
    e.preventDefault();
    trimModifierWord(mw, true);
  } else if (e.key === 'Delete') {
    if (anchor.nodeType === Node.TEXT_NODE && offset === anchor.textContent.length) {
      const next = anchor.nextSibling;
      if (next && next.classList?.contains('mw')) mw = next;
    } else if (anchor.nodeType === Node.ELEMENT_NODE) {
      const child = anchor.childNodes[offset];
      if (child && child.classList?.contains('mw')) mw = child;
    }
    if (!mw) return;
    e.preventDefault();
    trimModifierWord(mw, false);
  }
});

// Capture original HTML BEFORE any edits happen
$slidesArea.addEventListener('beforeinput', (e) => {
  if (ignoreInput) return;
  const te = e.target.closest('.te');
  if (!te) return;
  const card = te.closest('.slide-card');
  if (!card || card.dataset.state === 'no-audio') return;
  const slideId = card.dataset.slide;
  // Snapshot original content before first manual edit
  if (!slideOriginalHTML[slideId]) {
    slideOriginalHTML[slideId] = te.innerHTML;
  }
});

$slidesArea.addEventListener('input', (e) => {
  if (ignoreInput) return;
  const te = e.target.closest('.te');
  if (!te) return;
  // Skip edits inside modifier words — handled by the .mw input listener above
  if (findMwFromSelection()) return;
  const card = te.closest('.slide-card');
  if (!card || card.dataset.state === 'no-audio') return;

  const slideId = card.dataset.slide;
  slideTextDirty[slideId] = true;
  updateSlideFromContent(card);

  // Hide sources and show toast on first manual edit
  const sources = card.querySelector('.slide-sources');
  if (sources && sources.style.display !== 'none') {
    sources.style.display = 'none';
    showToast(card);
  }
});

// ============================================
// Toast: Linked references lost
// ============================================

const $toast = document.getElementById('toastRefs');
const $btnToastUndo = document.getElementById('btnToastUndo');
const $btnToastClose = document.getElementById('btnToastClose');

function showToast(card) {
  activeToastSlide = card;
  $toast.classList.add('visible');
}

function hideToast() {
  $toast.classList.remove('visible');
  activeToastSlide = null;
}

$btnToastUndo.addEventListener('click', () => {
  if (!activeToastSlide) return;
  const card = activeToastSlide;
  const slideId = card.dataset.slide;
  const te = card.querySelector('.te');
  const sources = card.querySelector('.slide-sources');

  // Restore original text
  if (slideOriginalHTML[slideId] && te) {
    ignoreInput = true;
    te.innerHTML = slideOriginalHTML[slideId];
    ignoreInput = false;
    delete slideOriginalHTML[slideId];
  }

  // Show sources again
  if (sources) sources.style.display = '';

  // Reset dirty state
  slideTextDirty[slideId] = false;
  updateSlideFromContent(card);
  hideToast();
});

$btnToastClose.addEventListener('click', hideToast);

// ============================================
// Event: Generate Audio / Regenerate Audio
// ============================================

$slidesArea.addEventListener('click', (e) => {
  const ghost = e.target.closest('.btn-ghost');
  if (!ghost) return;
  const card = ghost.closest('.slide-card');
  if (!card) return;

  if (card.dataset.state === 'no-audio' || card.dataset.state === 'text-changed') {
    const slideId = card.dataset.slide;
    slideTextDirty[slideId] = false;
    setSlideState(card, 'has-audio');
    slideModsSnapshot[slideId] = getModifierSnapshot(card);
  }
});

// ============================================
// Init: Pre-apply Tone modifier on Slide 3
// ============================================

(function initPresetModifiers() {
  const te = document.querySelector('[data-slide="3"] .te');
  if (!te) return;

  const walker = document.createTreeWalker(te, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.textContent.indexOf('architecture');
    if (idx < 0) continue;

    ignoreInput = true;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 'architecture'.length);

    const mwEl = createModifierWord('architecture', [
      { type: 'accent', value: 'Strong', badge: 'Strong' },
    ]);
    range.deleteContents();
    range.insertNode(mwEl);
    ignoreInput = false;
    break;
  }
})();

// ============================================
// Init: Snapshot has-audio slides
// ============================================

(function initSnapshots() {
  for (const card of document.querySelectorAll('.slide-card[data-state="has-audio"]')) {
    slideModsSnapshot[card.dataset.slide] = getModifierSnapshot(card);
  }
})();
