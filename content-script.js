// content-script.js
// Record clicks and inputs; store to chrome.storage.local; play back on demand.

const ACTIONS_KEY = 'plugin_rec_pro_actions';
const SETTINGS_KEY = 'plugin_rec_pro_settings'; // { stepDelay, findTimeout, typingMode }
let recording = false;
let handlersAttached = false;
let stopRequested = false;

function getBestSelector(el) {
  if (!(el instanceof Element)) return '';
  // Prefer stable attributes
  const preferAttrs = ['data-testid', 'data-test', 'data-qa', 'aria-label', 'name', 'placeholder', 'role'];
  for (const attr of preferAttrs) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (val) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
  }
  // Fallback to id
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 5) { // limit depth
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += `#${CSS.escape(el.id)}`;
      parts.unshift(selector);
      break;
    }
    // classes
    const className = (el.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2) // limit to first 2 classes for stability
      .map(c => `.${CSS.escape(c)}`)
      .join('');
    selector += className;
    // nth-child for sibling disambiguation
    const parent = el.parentElement;
    if (parent) {
      const tagSiblings = Array.from(parent.children).filter(ch => ch.tagName === el.tagName);
      if (tagSiblings.length > 1) {
        const idx = tagSiblings.indexOf(el) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(selector);
    el = el.parentElement;
  }
  return parts.join(' > ');
}

function buildTextXPathFor(el) {
  if (!(el instanceof Element)) return '';
  const tag = el.tagName.toLowerCase();
  const txt = (el.textContent || '').trim();
  if (!txt || txt.length > 60) return '';
  if (tag === 'button') return `//button[normalize-space(.)="${txt.replace(/"/g, '\\"')}"]`;
  if (tag === 'a') return `//a[normalize-space(.)="${txt.replace(/"/g, '\\"')}"]`;
  if (el.getAttribute('role') === 'button') return `//*[@role="button" and normalize-space(.)="${txt.replace(/"/g, '\\"')}"]`;
  return '';
}

function getXPath(el) {
  if (!(el instanceof Element)) return '';
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 8) {
    let ix = 1;
    let sib = el.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && sib.nodeName === el.nodeName) ix++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${el.nodeName.toLowerCase()}[${ix}]`);
    el = el.parentElement;
  }
  return '//' + parts.join('/');
}

async function getActions() {
  const obj = await chrome.storage.local.get(ACTIONS_KEY);
  return obj[ACTIONS_KEY] || [];
}

async function setActions(list) {
  await chrome.storage.local.set({ [ACTIONS_KEY]: list });
  chrome.runtime.sendMessage({ type: 'rec:count', count: list.length });
}

async function getSettings() {
  const obj = await chrome.storage.local.get(SETTINGS_KEY);
  const s = obj[SETTINGS_KEY] || {};
  return {
    stepDelay: typeof s.stepDelay === 'number' ? s.stepDelay : 300,
    findTimeout: typeof s.findTimeout === 'number' ? s.findTimeout : 3000,
    typingMode: (s.typingMode === 'type' || s.typingMode === 'set') ? s.typingMode : 'set',
  };
}

async function findElementWithRetry(selector, timeoutMs) {
  const isXPath = selector.startsWith('//') || selector.startsWith('.//');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let el = null;
    if (isXPath) {
      const res = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      el = res.singleNodeValue;
    } else {
      el = document.querySelector(selector);
    }
    if (el) return el;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

function captureClick(e) {
  if (!recording) return;
  const el = e.target;
  const selector = getBestSelector(el) || buildTextXPathFor(el) || getXPath(el);
  const entry = {
    t: Date.now(),
    type: 'click',
    selector,
    button: e.button,
  };
  getActions().then(list => setActions([...list, entry]));
}

function captureInput(e) {
  if (!recording) return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
  const selector = getBestSelector(el) || buildTextXPathFor(el) || getXPath(el);
  const entry = {
    t: Date.now(),
    type: 'input',
    selector,
    value: (el instanceof HTMLSelectElement) ? el.value : el.value,
  };
  getActions().then(list => setActions([...list, entry]));
}

function captureKeydown(e) {
  if (!recording) return;
  // Capture only essential keys for now (Enter)
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!(el instanceof Element)) return;
  const selector = getBestSelector(el) || buildTextXPathFor(el) || getXPath(el);
  const entry = {
    t: Date.now(),
    type: 'key',
    selector,
    key: e.key,
  };
  getActions().then(list => setActions([...list, entry]));
}

function attachHandlers() {
  if (handlersAttached) return;
  handlersAttached = true;
  window.addEventListener('click', captureClick, true); // capture phase to get early
  window.addEventListener('change', captureInput, true);
  window.addEventListener('input', captureInput, true);
  window.addEventListener('keydown', captureKeydown, true);
}

function detachHandlers() {
  if (!handlersAttached) return;
  handlersAttached = false;
  window.removeEventListener('click', captureClick, true);
  window.removeEventListener('change', captureInput, true);
  window.removeEventListener('input', captureInput, true);
  window.removeEventListener('keydown', captureKeydown, true);
}

async function playActions(listOverride) {
  const [storedList, settings] = await Promise.all([getActions(), getSettings()]);
  const list = Array.isArray(listOverride) ? listOverride : storedList;
  stopRequested = false;
  for (const act of list) {
    if (stopRequested) break;
    if (act.type === 'waitForSelector') {
      const elWait = await findElementWithRetry(act.selector, settings.findTimeout);
      if (!elWait) { console.warn('waitForSelector timeout', act); }
      await new Promise(r => setTimeout(r, settings.stepDelay));
      continue;
    }
    if (act.type === 'waitForText') {
      const start = Date.now();
      const needle = String(act.text || '').trim();
      const selector = act.selector;
      while (Date.now() - start < settings.findTimeout) {
        let ok = false;
        if (selector) {
          const el = await findElementWithRetry(selector, 0);
          ok = !!(el && typeof el.textContent === 'string' && el.textContent.includes(needle));
        } else {
          ok = document.body && document.body.innerText && document.body.innerText.includes(needle);
        }
        if (ok) break;
        await new Promise(r => setTimeout(r, 100));
      }
      await new Promise(r => setTimeout(r, settings.stepDelay));
      continue;
    }

    const el = await findElementWithRetry(act.selector, settings.findTimeout);
    if (!el) { console.warn('Playback: element not found', act); continue; }
    if (act.type === 'click') {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, button: act.button || 0 });
      el.dispatchEvent(evt);
    } else if (act.type === 'input') {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        const targetVal = act.value ?? '';
        if (settings.typingMode === 'type') {
          el.value = '';
          for (const ch of String(targetVal)) {
            el.value = el.value + ch;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 30));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.value = targetVal;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (el instanceof HTMLSelectElement) {
        el.value = act.value ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (act.type === 'key') {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      el.focus();
      const kd = new KeyboardEvent('keydown', { key: act.key, bubbles: true, cancelable: true });
      el.dispatchEvent(kd);
      const ku = new KeyboardEvent('keyup', { key: act.key, bubbles: true, cancelable: true });
      el.dispatchEvent(ku);
    }
    await new Promise(r => setTimeout(r, settings.stepDelay));
  }
  // notify done
  chrome.runtime.sendMessage({ type: 'rec:playDone' });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'rec:start') {
    recording = true;
    attachHandlers();
    sendResponse && sendResponse({ ok: true });
  }
  if (msg.type === 'rec:stop') {
    recording = false;
    detachHandlers();
    sendResponse && sendResponse({ ok: true });
  }
  if (msg.type === 'rec:play') {
    playActions().then(() => sendResponse && sendResponse({ ok: true }));
    return true; // async
  }
  if (msg.type === 'rec:playMacro') {
    const actions = Array.isArray(msg.actions) ? msg.actions : [];
    playActions(actions).then(() => sendResponse && sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'rec:playStop') {
    stopRequested = true;
    sendResponse && sendResponse({ ok: true });
  }
  if (msg.type === 'rec:ping') {
    sendResponse && sendResponse({ ok: true });
  }
  if (msg.type === 'rec:cleared') {
    // no-op UI feedback could be inserted here
  }
});

// Ensure counters reflect stored actions on load
getActions().then(list => chrome.runtime.sendMessage({ type: 'rec:count', count: list.length }));
