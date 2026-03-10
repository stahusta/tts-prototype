/**
 * VoxCraft — Text-to-Speech Editor
 * Word-level modifier system with cascading context menu.
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
    label: 'Accent',
    desc: 'Pronounce with accent',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20"/><line x1="2" y1="12" x2="22" y2="12"/>',
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

const $card = document.getElementById('cardSlides');
const $ctxWrap = document.getElementById('ctxWrap');
const $panelMain = document.getElementById('panelMain');
const $subAccent = document.getElementById('subAccent');
const $subSayAs = document.getElementById('subSayAs');
const $saInput = document.getElementById('saInput');
const $btnSaApply = document.getElementById('btnSaApply');

const SUB_PANELS = [$subAccent, $subSayAs];
const SUB_MAP = { accent: $subAccent, sayas: $subSayAs };

// ============================================
// State
// ============================================

let savedSelection = null;
let targetModifierWord = null;
let activeSubPanel = null;
let currentVersion = 'v1';

// ============================================
// SVG Templates
// ============================================

const ICON_CHEVRON = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// ============================================
// Helpers
// ============================================

/** Extract raw text content from a modifier word element (ignoring child elements). */
function getWordText(mwEl) {
  let text = '';
  for (const node of mwEl.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  }
  return text.trim();
}

/** Find the closest `.te` editor ancestor from a given node. */
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
  activeSubPanel = null;
}

function clearActiveItems() {
  for (const item of $panelMain.querySelectorAll('.ctx-it')) {
    item.classList.remove('active-item');
  }
}

function hideMenu() {
  $ctxWrap.classList.remove('visible');
  $panelMain.classList.remove('vis');
  closeSubPanels();
  clearActiveItems();
}

function resetMenuState() {
  hideMenu();
  savedSelection = null;
  targetModifierWord = null;
}

function openSubPanel(panel) {
  closeSubPanels();
  panel.style.display = 'block';
  activeSubPanel = panel;
  panel.classList.add('vis');
  requestAnimationFrame(adjustMenuPosition);
}

// ============================================
// Context Menu — Build & Open
// ============================================

function openMenu(x, y, word, mwEl) {
  hideMenu();

  const mods = mwEl ? JSON.parse(mwEl.dataset.mods || '[]') : [];
  const modsByType = {};
  for (const mod of mods) modsByType[mod.type] = mod;

  let html = '<div class="ctx-hd">Edit word</div>';

  for (const type of MOD_ORDER) {
    const config = MODIFIERS[type];
    const activeMod = modsByType[type];
    const hasSub = !!SUB_MAP[type];

    html += `<div class="ctx-it${activeMod ? ' active-item' : ''}" data-open="${type}">`;
    html += `<div class="ctx-ic-box"><svg viewBox="0 0 24 24">${config.icon}</svg></div>`;
    html += `<div class="ctx-it-t"><span class="ctx-it-l">${config.label}</span><span class="ctx-it-d">${config.desc}</span></div>`;

    if (activeMod) {
      const displayValue = activeMod.badge || activeMod.value;
      html += `<span class="ctx-val">${displayValue}</span>`;
      html += `<button class="ctx-del" data-remove="${type}">${ICON_CLOSE}</button>`;
    } else if (hasSub) {
      html += `<span class="ctx-it-arrow">${ICON_CHEVRON}</span>`;
    }

    html += '</div>';
  }

  $panelMain.innerHTML = html;
  bindMenuItemEvents();
  bindRemoveEvents();

  $ctxWrap.style.left = x + 'px';
  $ctxWrap.style.top = y + 'px';
  $ctxWrap.classList.add('visible');

  requestAnimationFrame(() => {
    $panelMain.classList.add('vis');
    adjustMenuPosition();
  });
}

// ============================================
// Context Menu — Event Bindings
// ============================================

function bindMenuItemEvents() {
  for (const item of $panelMain.querySelectorAll('.ctx-it[data-open]')) {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.ctx-del')) return;

      const type = item.dataset.open;
      clearActiveItems();
      item.classList.add('active-item');

      if (type === 'pause') {
        applyModifier('pause', 'On');
        return;
      }

      if (SUB_MAP[type]) {
        openSubPanel(SUB_MAP[type]);
        if (type === 'sayas') {
          $saInput.value = '';
          setTimeout(() => $saInput.focus(), 60);
        }
      }
    });
  }
}

function bindRemoveEvents() {
  for (const btn of $panelMain.querySelectorAll('.ctx-del[data-remove]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!targetModifierWord) return;

      const type = btn.dataset.remove;
      const mods = JSON.parse(targetModifierWord.dataset.mods || '[]');
      const idx = mods.findIndex((m) => m.type === type);
      if (idx >= 0) mods.splice(idx, 1);

      targetModifierWord.dataset.mods = JSON.stringify(mods);
      refreshModifierWord(targetModifierWord);

      if (mods.length === 0) {
        resetMenuState();
      } else {
        const rect = targetModifierWord.getBoundingClientRect();
        openMenu(rect.left, rect.bottom + 8, getWordText(targetModifierWord), targetModifierWord);
      }
    });
  }
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
  // Editing an existing modifier word
  if (targetModifierWord) {
    const mods = JSON.parse(targetModifierWord.dataset.mods || '[]');
    const mod = { type, value };
    if (badge) mod.badge = badge;

    const idx = mods.findIndex((m) => m.type === type);
    if (idx >= 0) mods[idx] = mod;
    else mods.push(mod);

    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);
    hideMenu();
    return;
  }

  // Creating a new modifier word from selection
  if (!savedSelection || !savedSelection.range) return;

  const { range, text } = savedSelection;
  const mod = { type, value };
  if (badge) mod.badge = badge;

  const mwEl = createModifierWord(text, [mod]);
  range.deleteContents();
  range.insertNode(mwEl);

  // Ensure there's a space after the modifier word
  const next = mwEl.nextSibling;
  if (!next || (next.nodeType === Node.TEXT_NODE && !next.textContent.startsWith(' '))) {
    mwEl.after(document.createTextNode('\u00A0'));
  }

  window.getSelection().removeAllRanges();
  savedSelection = null;
  targetModifierWord = null;
  hideMenu();
}

// ============================================
// Event: Text Selection → Open Menu
// ============================================

$card.addEventListener('mouseup', (e) => {
  if (currentVersion !== 'v1') return;
  if (e.target.closest('.mw')) return;

  const editor = e.target.closest('.te');
  if (!editor) return;

  const sel = window.getSelection();
  const text = sel.toString().trim();
  if (!text) return;
  if (!editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) return;

  // Single word only — reject if contains whitespace
  if (/\s/.test(text)) return;

  savedSelection = { range: sel.getRangeAt(0).cloneRange(), text };
  targetModifierWord = null;

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  openMenu(rect.left, rect.bottom + 8, text, null);
});

// ============================================
// Event: Click Existing Modifier Word
// ============================================

$card.addEventListener('click', (e) => {
  if (currentVersion !== 'v1') return;
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
// Event: Sub-panel — Accent
// ============================================

$subAccent.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-acc]');
  if (btn && savedSelection) {
    applyModifier('accent', btn.dataset.accL, btn.dataset.acc);
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
  if (value && savedSelection) applyModifier('sayas', value);
});

$saInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $btnSaApply.click();
  }
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
  if (!$ctxWrapV2.contains(e.target) && $ctxWrapV2.classList.contains('visible')) hideV2Menu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    resetMenuState();
    if ($ctxWrapV2.classList.contains('visible')) hideV2Menu();
  }
});

// ============================================
// Event: Version Switching
// ============================================

const $ctxWrapV2 = document.getElementById('ctxWrapV2');
const $panelV2 = document.getElementById('panelV2');
const $subAccentV2 = document.getElementById('subAccentV2');
const $subSayAsV2 = document.getElementById('subSayAsV2');
const $saInputV2 = document.getElementById('saInputV2');
const $btnSaApplyV2 = document.getElementById('btnSaApplyV2');
const $v2WordLabel = document.getElementById('v2WordLabel');

const V2_SUB_PANELS = [$subAccentV2, $subSayAsV2];

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
    tab.classList.add('active');
    currentVersion = tab.dataset.version;
    resetMenuState();
    hideV2Menu();
  });
}

// ============================================
// V2 Context Menu — Logic
// ============================================

function closeV2SubPanels() {
  for (const panel of V2_SUB_PANELS) {
    panel.classList.remove('vis');
    panel.style.display = 'none';
  }
}

function hideV2Menu() {
  $ctxWrapV2.classList.remove('visible');
  $panelV2.classList.remove('vis');
  closeV2SubPanels();
}

function adjustV2Position() {
  const rect = $ctxWrapV2.getBoundingClientRect();
  let nx = parseFloat($ctxWrapV2.style.left);
  let ny = parseFloat($ctxWrapV2.style.top);
  if (rect.right > window.innerWidth - 12) nx = window.innerWidth - rect.width - 12;
  if (rect.bottom > window.innerHeight - 12) ny -= rect.bottom - window.innerHeight + 16;
  if (nx < 12) nx = 12;
  if (ny < 12) ny = 12;
  $ctxWrapV2.style.left = nx + 'px';
  $ctxWrapV2.style.top = ny + 'px';
}

function buildV2MainPanel(word, mwEl) {
  const mods = mwEl ? JSON.parse(mwEl.dataset.mods || '[]') : [];
  const modsByType = {};
  for (const mod of mods) modsByType[mod.type] = mod;

  $v2WordLabel.textContent = 'Edit word';

  const ICON_X = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // Update each menu item to show active state
  for (const item of $panelV2.querySelectorAll('[data-v2action]')) {
    const type = item.dataset.v2action;
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
      removeEl.dataset.v2remove = type;
      removeEl.innerHTML = ICON_X;
      item.appendChild(removeEl);
    } else {
      if (chevron) chevron.style.display = '';
    }
  }
}

function openV2Menu(x, y, word, mwEl) {
  hideV2Menu();
  buildV2MainPanel(word, mwEl);

  $ctxWrapV2.style.left = x + 'px';
  $ctxWrapV2.style.top = y + 'px';
  $ctxWrapV2.classList.add('visible');

  requestAnimationFrame(() => {
    $panelV2.classList.add('vis');
    adjustV2Position();
  });
}

function openV2SubPanel(panel) {
  closeV2SubPanels();
  panel.style.display = 'block';
  requestAnimationFrame(() => {
    panel.classList.add('vis');
    adjustV2Position();
  });
}

// V2: Open on word selection
$card.addEventListener('mouseup', (e) => {
  if (currentVersion !== 'v2') return;
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
  openV2Menu(rect.left, rect.bottom + 8, text, null);
});

// V2: Click existing modifier word
$card.addEventListener('click', (e) => {
  if (currentVersion !== 'v2') return;
  const mwEl = e.target.closest('.mw');
  if (!mwEl) return;
  if (!mwEl.closest('.te')) return;
  if (window.getSelection().toString().trim()) return;

  e.stopPropagation();
  targetModifierWord = mwEl;
  savedSelection = { existingEl: mwEl, text: getWordText(mwEl) };

  const rect = mwEl.getBoundingClientRect();
  openV2Menu(rect.left, rect.bottom + 8, getWordText(mwEl), mwEl);
});

// V2: Main menu item clicks
$panelV2.addEventListener('click', (e) => {
  // Handle remove button
  const removeBtn = e.target.closest('.ctx-v2-remove');
  if (removeBtn && targetModifierWord) {
    e.stopPropagation();
    const type = removeBtn.dataset.v2remove;
    const mods = JSON.parse(targetModifierWord.dataset.mods || '[]');
    const idx = mods.findIndex((m) => m.type === type);
    if (idx >= 0) mods.splice(idx, 1);

    targetModifierWord.dataset.mods = JSON.stringify(mods);
    refreshModifierWord(targetModifierWord);

    if (mods.length === 0) {
      hideV2Menu();
      savedSelection = null;
      targetModifierWord = null;
    } else {
      const rect = targetModifierWord.getBoundingClientRect();
      openV2Menu(rect.left, rect.bottom + 8, getWordText(targetModifierWord), targetModifierWord);
    }
    return;
  }

  const item = e.target.closest('[data-v2action]');
  if (!item) return;

  const type = item.dataset.v2action;

  if (type === 'pause') {
    applyModifier('pause', 'On');
    hideV2Menu();
    return;
  }

  if (type === 'accent') {
    openV2SubPanel($subAccentV2);
  } else if (type === 'sayas') {
    openV2SubPanel($subSayAsV2);
    $saInputV2.value = '';
    setTimeout(() => $saInputV2.focus(), 60);
  }
});

// V2: Accent sub-panel
$subAccentV2.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-v2acc]');
  if (btn && savedSelection) {
    applyModifier('accent', btn.dataset.v2accL, btn.dataset.v2acc);
    hideV2Menu();
  }
});

// V2: Say As sub-panel — language buttons
$subSayAsV2.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-v2sal]');
  if (btn && savedSelection) {
    applyModifier('sayas', 'lang:' + btn.dataset.v2sal, btn.textContent.trim());
    hideV2Menu();
  }
});

// V2: Say As — custom input
$btnSaApplyV2.addEventListener('click', () => {
  const value = $saInputV2.value.trim();
  if (value && savedSelection) {
    applyModifier('sayas', value);
    hideV2Menu();
  }
});

$saInputV2.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $btnSaApplyV2.click();
  }
});

// V2: Prevent selection loss
$ctxWrapV2.addEventListener('mousedown', (e) => e.preventDefault());
