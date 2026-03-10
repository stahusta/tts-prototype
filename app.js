/**
 * VoxCraft — Text-to-Speech Editor
 * Word-level modifier system with context menu.
 */

// ============================================
// Modifier Configuration
// ============================================

const MODIFIERS = {
  pause: {
    label: 'Pause',
    desc: 'Insert pause after word',
    icon: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  },
  accent: {
    label: 'Tone',
    desc: 'Speech delivery style',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  },
  sayas: {
    label: 'Say As',
    desc: 'Alternative pronunciation',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8h5"/><path d="M7 12h10"/>',
  },
};

const MOD_ORDER = ['pause', 'accent', 'sayas'];

// ============================================
// DOM References
// ============================================

const $slidesArea = document.getElementById('slidesArea');
const $ctxWrap = document.getElementById('ctxWrap');
const $panelMain = document.getElementById('panelMain');
const $subTone = document.getElementById('subTone');
const $subSayAs = document.getElementById('subSayAs');
const $saInput = document.getElementById('saInput');
const $btnSaApply = document.getElementById('btnSaApply');
const $menuWordLabel = document.getElementById('menuWordLabel');

const SUB_PANELS = [$subTone, $subSayAs];
const SUB_MAP = { accent: $subTone, sayas: $subSayAs };

// ============================================
// State
// ============================================

let savedSelection = null;
let targetModifierWord = null;

// ============================================
// SVG Templates
// ============================================

const ICON_CLOSE = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

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

// ============================================
// Context Menu — Positioning
// ============================================

function adjustMenuPosition() {
  const rect = $ctxWrap.getBoundingClientRect();
  let x = parseFloat($ctxWrap.style.left);
  let y = parseFloat($ctxWrap.style.top);

  if (rect.right > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;
  if (rect.bottom > window.innerHeight - 12) y -= rect.bottom - window.innerHeight + 16;
  if (x < 12) x = 12;
  if (y < 12) y = 12;

  $ctxWrap.style.left = x + 'px';
  $ctxWrap.style.top = y + 'px';
}

// ============================================
// Context Menu — Visibility
// ============================================

function closeSubPanels() {
  for (const panel of SUB_PANELS) {
    panel.classList.remove('vis');
    panel.style.display = 'none';
  }
}

function hideMenu() {
  $ctxWrap.classList.remove('visible');
  $panelMain.classList.remove('vis');
  closeSubPanels();
}

function resetMenuState() {
  hideMenu();
  savedSelection = null;
  targetModifierWord = null;
}

function openSubPanel(panel) {
  closeSubPanels();
  panel.style.display = 'block';
  requestAnimationFrame(() => {
    panel.classList.add('vis');
    adjustMenuPosition();
  });
}

// ============================================
// Context Menu — Build & Open
// ============================================

function buildMainPanel(word, mwEl) {
  const mods = mwEl ? JSON.parse(mwEl.dataset.mods || '[]') : [];
  const modsByType = {};
  for (const mod of mods) modsByType[mod.type] = mod;

  $menuWordLabel.textContent = 'Edit word';

  for (const item of $panelMain.querySelectorAll('[data-action]')) {
    const type = item.dataset.action;
    const activeMod = modsByType[type];

    // Remove old val/remove elements
    const oldVal = item.querySelector('.ctx-v2-val');
    const oldRemove = item.querySelector('.ctx-v2-remove');
    if (oldVal) oldVal.remove();
    if (oldRemove) oldRemove.remove();

    // Show/hide chevron
    const chevron = item.querySelector('.ctx-v2-chevron');

    if (activeMod) {
      const displayValue = activeMod.badge || activeMod.value;
      if (chevron) chevron.style.display = 'none';

      const valEl = document.createElement('span');
      valEl.className = 'ctx-v2-val';
      valEl.textContent = displayValue;
      item.appendChild(valEl);

      const removeEl = document.createElement('button');
      removeEl.className = 'ctx-v2-remove';
      removeEl.dataset.remove = type;
      removeEl.innerHTML = ICON_CLOSE;
      item.appendChild(removeEl);
    } else {
      if (chevron) chevron.style.display = '';
    }
  }
}

function openMenu(x, y, word, mwEl) {
  hideMenu();
  buildMainPanel(word, mwEl);

  $ctxWrap.style.left = x + 'px';
  $ctxWrap.style.top = y + 'px';
  $ctxWrap.classList.add('visible');

  requestAnimationFrame(() => {
    $panelMain.classList.add('vis');
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
  el.setAttribute('contenteditable', 'false');
  renderModifierWordContent(el, text, mods);
  return el;
}

function renderModifierWordContent(el, text, mods) {
  const counter = document.createElement('span');
  counter.className = 'mw-count';
  counter.textContent = mods.length;
  el.appendChild(counter);

  el.appendChild(document.createTextNode(text));

  el.dataset.tip = mods
    .map((m) => {
      const label = MODIFIERS[m.type]?.label || m.type;
      const val = m.badge || m.value;
      return val && val !== 'On' ? `${label}: ${val}` : label;
    })
    .join(' \u00B7 ');
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

    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);
    closeSubPanels();
    buildMainPanel(getWordText(targetModifierWord), targetModifierWord);
    return;
  }

  if (!savedSelection || !savedSelection.range) return;

  const { range, text } = savedSelection;
  const mod = { type, value };
  if (badge) mod.badge = badge;

  const mwEl = createModifierWord(text, [mod]);
  range.deleteContents();
  range.insertNode(mwEl);

  const next = mwEl.nextSibling;
  if (!next || (next.nodeType === Node.TEXT_NODE && !next.textContent.startsWith(' '))) {
    mwEl.after(document.createTextNode('\u00A0'));
  }

  window.getSelection().removeAllRanges();
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

  savedSelection = { range: sel.getRangeAt(0).cloneRange(), text };
  targetModifierWord = null;

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  openMenu(rect.left, rect.bottom + 8, text, null);
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
  openMenu(rect.left, rect.bottom + 8, getWordText(mwEl), mwEl);
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

    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);

    if (mods.length === 0) {
      // Word unwrapped — keep menu open but clear target
      closeSubPanels();
      savedSelection = null;
      targetModifierWord = null;
      hideMenu();
    } else {
      closeSubPanels();
      buildMainPanel(getWordText(targetModifierWord), targetModifierWord);
    }
    return;
  }

  const item = e.target.closest('[data-action]');
  if (!item) return;

  const type = item.dataset.action;

  if (type === 'pause') {
    applyModifier('pause', 'On');
    return;
  }

  if (type === 'accent') {
    openSubPanel($subTone);
  } else if (type === 'sayas') {
    openSubPanel($subSayAs);
    $saInput.value = '';
    setTimeout(() => $saInput.focus(), 60);
  }
});

// ============================================
// Event: Sub-panel — Tone
// ============================================

$subTone.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tone]');
  if (btn && savedSelection) {
    applyModifier('accent', btn.dataset.toneL, btn.dataset.tone);
  }
});

// ============================================
// Event: Sub-panel — Say As
// ============================================

$subSayAs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sal]');
  if (btn && savedSelection) {
    applyModifier('sayas', 'lang:' + btn.dataset.sal, btn.textContent.trim());
  }
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

$ctxWrap.addEventListener('mousedown', (e) => e.preventDefault());

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
