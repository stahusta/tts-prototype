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
    icon: '<line x1="10" y1="4" x2="10" y2="20"/><line x1="14" y1="4" x2="14" y2="20"/>',
  },
  accent: {
    label: 'Accent',
    desc: 'Pronounce with accent',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20"/><line x1="2" y1="12" x2="22" y2="12"/>',
  },
  sayas: {
    label: 'Say As',
    desc: 'Alternative pronunciation',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 9h10"/><path d="M7 13h6"/>',
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
  if ($ctxWrap.contains(e.target)) return;
  if ($ctxWrap.classList.contains('visible')) resetMenuState();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') resetMenuState();
});

// ============================================
// Event: Tab Switching
// ============================================

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
    tab.classList.add('active');
  });
}
