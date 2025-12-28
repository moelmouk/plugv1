// background.js (MV3 service worker)
// Handles control messages from popup and relays to active tab content script

const STATE_KEY = 'plugin_rec_pro_state';
const ACTIONS_KEY = 'plugin_rec_pro_actions';
const MACROS_KEY = 'plugin_rec_pro_macros';

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function setState(patch) {
  const cur = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || { recording: false, actionsCount: 0 };
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  try { await updateBadge(next.recording); } catch (_) {}
  return next;
}

function isScriptableUrl(url) {
  if (!url) return false;
  // Disallow system/extension pages where content scripts cannot run
  return !/^(chrome:\/\/|edge:\/\/|about:|chrome-extension:\/\/)/i.test(url);
}

async function ensureContentScript(tabId) {
  try {
    // ping: if a receiver exists, this resolves; otherwise it throws
    await chrome.tabs.sendMessage(tabId, { type: 'rec:ping' });
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content-script.js']
      });
      // give it a short moment to initialize
      await new Promise(r => setTimeout(r, 50));
      return true;
    } catch (e2) {
      console.warn('Failed to inject content-script.js', e2);
      return false;
    }
  }
}

async function sendToTab(tab, message) {
  if (!tab?.id) throw new Error('No active tab');
  if (!isScriptableUrl(tab.url)) throw new Error('Active tab URL is not scriptable');
  const ok = await ensureContentScript(tab.id);
  if (!ok) throw new Error('Could not inject content script');
  return chrome.tabs.sendMessage(tab.id, message);
}

chrome.runtime.onInstalled.addListener(() => {
  setState({ recording: false, actionsCount: 0 });
});

async function updateBadge(isRecording) {
  if (isRecording) {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    if (msg.type === 'getStatus') {
      const st = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || { recording: false, actionsCount: 0 };
      sendResponse({ ok: true, state: st });
      return;
    }

    if (msg.type === 'startRecording') {
      const tab = await getActiveTab();
      try {
        await sendToTab(tab, { type: 'rec:start' });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
      const st = await setState({ recording: true });
      sendResponse({ ok: true, state: st });
      return;
    }

    if (msg.type === 'stopRecording') {
      const tab = await getActiveTab();
      try {
        await sendToTab(tab, { type: 'rec:stop' });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
      const st = await setState({ recording: false });
      // Save current actions as a macro
      try {
        const store = await chrome.storage.local.get([ACTIONS_KEY, MACROS_KEY]);
        const actions = store[ACTIONS_KEY] || [];
        if (actions.length > 0) {
          const macros = store[MACROS_KEY] || [];
          const ts = new Date();
          const name = `Macro ${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}:${String(ts.getSeconds()).padStart(2,'0')}`;
          macros.push({ id: cryptoRandomId(), name, createdAt: ts.toISOString(), count: actions.length, actions });
          await chrome.storage.local.set({ [MACROS_KEY]: macros, [ACTIONS_KEY]: [] });
          chrome.runtime.sendMessage({ type: 'macros:updated' });
        }
      } catch (e) { /* ignore */ }
      sendResponse({ ok: true, state: st });
      return;
    }

    if (msg.type === 'playRecording') {
      const tab = await getActiveTab();
      try {
        await sendToTab(tab, { type: 'rec:play' });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'playMacro') {
      const tab = await getActiveTab();
      try {
        await sendToTab(tab, { type: 'rec:playMacro', actions: msg.actions || [] });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'playStop') {
      const tab = await getActiveTab();
      try {
        await sendToTab(tab, { type: 'rec:playStop' });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'clearRecording') {
      await chrome.storage.local.remove('plugin_rec_pro_actions');
      const st = await setState({ actionsCount: 0 });
      const tab = await getActiveTab();
      if (tab?.id) {
        try { await sendToTab(tab, { type: 'rec:cleared' }); } catch (_) {}
      }
      sendResponse({ ok: true, state: st });
      return;
    }
  })();
  return true; // keep channel open for async sendResponse
});

// Keep actionsCount in sync when content-script updates it
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'rec:count') {
    setState({ actionsCount: msg.count });
  }
});

// small helper: random id without external deps
function cryptoRandomId() {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch {
    return String(Math.random()).slice(2) + String(Date.now());
  }
}
