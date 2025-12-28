// background.js - Plugin Rec Pro v2.0
// Service Worker MV3 avec gestion avancée des macros, variables et debug

const STATE_KEY = 'plugin_rec_pro_state';
const ACTIONS_KEY = 'plugin_rec_pro_actions';
const MACROS_KEY = 'plugin_rec_pro_macros';
const VARIABLES_KEY = 'plugin_rec_pro_variables';
const FOLDERS_KEY = 'plugin_rec_pro_folders';
const SETTINGS_KEY = 'plugin_rec_pro_settings';
const DEBUG_LOG_KEY = 'plugin_rec_pro_debug_log';

// ============== UTILITIES ==============

function cryptoRandomId() {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}

function formatTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

// ============== TAB MANAGEMENT ==============

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isScriptableUrl(url) {
  if (!url) return false;
  return !/^(chrome:\/\/|edge:\/\/|about:|chrome-extension:\/\/|moz-extension:\/\/|file:\/\/)/i.test(url);
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'rec:ping' });
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content-script.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId, allFrames: true },
        files: ['content-styles.css']
      });
      await new Promise(r => setTimeout(r, 100));
      return true;
    } catch (e2) {
      console.warn('[Plugin Rec Pro] Failed to inject content script:', e2);
      return false;
    }
  }
}

async function sendToTab(tab, message) {
  if (!tab?.id) throw new Error('No active tab');
  if (!isScriptableUrl(tab.url)) throw new Error('Cette page ne peut pas être scriptée (page système)');
  const ok = await ensureContentScript(tab.id);
  if (!ok) throw new Error('Impossible d\'injecter le content script');
  return chrome.tabs.sendMessage(tab.id, message);
}

// ============== STATE MANAGEMENT ==============

async function getState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return result[STATE_KEY] || {
    recording: false,
    playing: false,
    paused: false,
    debugMode: false,
    actionsCount: 0,
    currentMacroId: null,
  };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  await updateBadge(next);
  return next;
}

async function updateBadge(state) {
  try {
    if (state.recording) {
      await chrome.action.setBadgeText({ text: 'REC' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else if (state.playing) {
      await chrome.action.setBadgeText({ text: state.paused ? 'II' : '▶' });
      await chrome.action.setBadgeBackgroundColor({ color: state.paused ? '#f59e0b' : '#10b981' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    // Ignore badge errors
  }
}

// ============== MACROS MANAGEMENT ==============

async function getMacros() {
  const result = await chrome.storage.local.get(MACROS_KEY);
  return result[MACROS_KEY] || [];
}

async function setMacros(macros) {
  await chrome.storage.local.set({ [MACROS_KEY]: macros });
}

async function saveMacro(name, actions, folderId = null, tags = []) {
  const macros = await getMacros();
  const ts = new Date();

  const macro = {
    id: cryptoRandomId(),
    name: name || `Macro ${formatTimestamp(ts)}`,
    createdAt: ts.toISOString(),
    updatedAt: ts.toISOString(),
    count: actions.length,
    actions: actions,
    folderId: folderId,
    tags: tags,
    description: '',
    favorite: false,
  };

  macros.push(macro);
  await setMacros(macros);
  return macro;
}

async function updateMacro(id, updates) {
  const macros = await getMacros();
  const index = macros.findIndex(m => m.id === id);
  if (index === -1) throw new Error('Macro non trouvée');

  macros[index] = {
    ...macros[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await setMacros(macros);
  return macros[index];
}

async function deleteMacro(id) {
  const macros = await getMacros();
  const filtered = macros.filter(m => m.id !== id);
  await setMacros(filtered);
}

async function duplicateMacro(id) {
  const macros = await getMacros();
  const original = macros.find(m => m.id === id);
  if (!original) throw new Error('Macro non trouvée');

  const copy = {
    ...original,
    id: cryptoRandomId(),
    name: `${original.name} (copie)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  macros.push(copy);
  await setMacros(macros);
  return copy;
}

// ============== FOLDERS MANAGEMENT ==============

async function getFolders() {
  const result = await chrome.storage.local.get(FOLDERS_KEY);
  return result[FOLDERS_KEY] || [];
}

async function setFolders(folders) {
  await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
}

async function createFolder(name, parentId = null) {
  const folders = await getFolders();
  const folder = {
    id: cryptoRandomId(),
    name,
    parentId,
    createdAt: new Date().toISOString(),
  };
  folders.push(folder);
  await setFolders(folders);
  return folder;
}

async function deleteFolder(id) {
  const folders = await getFolders();
  const filtered = folders.filter(f => f.id !== id);
  await setFolders(filtered);

  // Déplacer les macros du dossier supprimé
  const macros = await getMacros();
  const updated = macros.map(m => m.folderId === id ? { ...m, folderId: null } : m);
  await setMacros(updated);
}

// ============== VARIABLES ==============

async function getVariables() {
  const result = await chrome.storage.local.get(VARIABLES_KEY);
  return result[VARIABLES_KEY] || {};
}

async function setVariables(vars) {
  await chrome.storage.local.set({ [VARIABLES_KEY]: vars });
}

async function clearVariables() {
  await chrome.storage.local.remove(VARIABLES_KEY);
}

// ============== DEBUG LOG ==============

async function getDebugLog() {
  const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
  return result[DEBUG_LOG_KEY] || [];
}

async function addDebugLog(entry) {
  const log = await getDebugLog();
  log.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Garder les 500 derniers logs
  if (log.length > 500) {
    log.splice(0, log.length - 500);
  }
  await chrome.storage.local.set({ [DEBUG_LOG_KEY]: log });
}

async function clearDebugLog() {
  await chrome.storage.local.remove(DEBUG_LOG_KEY);
}

// ============== SETTINGS ==============

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] || {
    stepDelay: 300,
    findTimeout: 5000,
    typingMode: 'set',
    typingSpeed: 30,
    highlightElements: true,
    screenshotOnError: false,
    continueOnError: false,
    theme: 'dark',
  };
}

async function setSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ============== MESSAGE HANDLERS ==============

chrome.runtime.onInstalled.addListener(() => {
  setState({ recording: false, playing: false, paused: false, actionsCount: 0 });
  console.log('[Plugin Rec Pro] Extension installed/updated');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    try {
      switch (msg.type) {
        // === STATUS ===
        case 'getStatus': {
          const state = await getState();
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          state.actionsCount = (actionsStore[ACTIONS_KEY] || []).length;
          sendResponse({ ok: true, state });
          break;
        }

        // === RECORDING ===
        case 'startRecording': {
          const tab = await getActiveTab();
          await sendToTab(tab, { type: 'rec:start', debug: msg.debug || false });
          const state = await setState({ recording: true, playing: false, paused: false, debugMode: msg.debug || false });
          await addDebugLog({ type: 'recording_started', tabUrl: tab.url });
          sendResponse({ ok: true, state });
          break;
        }

        case 'stopRecording': {
          const tab = await getActiveTab();
          await sendToTab(tab, { type: 'rec:stop' });

          // Sauvegarder en tant que macro si des actions existent
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = actionsStore[ACTIONS_KEY] || [];

          let savedMacro = null;
          if (actions.length > 0 && msg.saveMacro !== false) {
            savedMacro = await saveMacro(msg.macroName, actions, msg.folderId, msg.tags);
            // Vider les actions courantes
            await chrome.storage.local.remove(ACTIONS_KEY);
          }

          const state = await setState({ recording: false, actionsCount: 0 });
          await addDebugLog({ type: 'recording_stopped', actionsCount: actions.length, macroId: savedMacro?.id });
          sendResponse({ ok: true, state, macro: savedMacro });
          break;
        }

        // === PLAYBACK ===
        case 'playRecording': {
          const tab = await getActiveTab();
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = actionsStore[ACTIONS_KEY] || [];

          if (actions.length === 0) {
            sendResponse({ ok: false, error: 'Aucune action à rejouer' });
            return;
          }

          await setState({ playing: true, paused: false });
          await sendToTab(tab, { type: 'rec:play', actions, debug: msg.debug || false });
          await addDebugLog({ type: 'playback_started', actionsCount: actions.length });
          sendResponse({ ok: true });
          break;
        }

        case 'playMacro': {
          const tab = await getActiveTab();
          const macros = await getMacros();
          const macro = macros.find(m => m.id === msg.macroId);

          if (!macro) {
            sendResponse({ ok: false, error: 'Macro non trouvée' });
            return;
          }

          await setState({ playing: true, paused: false, currentMacroId: macro.id });
          await sendToTab(tab, { type: 'rec:playMacro', actions: macro.actions, debug: msg.debug || false });
          await addDebugLog({ type: 'macro_playback_started', macroId: macro.id, macroName: macro.name });
          sendResponse({ ok: true });
          break;
        }

        case 'playStop': {
          const tab = await getActiveTab();
          try {
            await sendToTab(tab, { type: 'rec:playStop' });
          } catch (e) { /* ignore */ }
          await setState({ playing: false, paused: false, currentMacroId: null });
          await addDebugLog({ type: 'playback_stopped' });
          sendResponse({ ok: true });
          break;
        }

        case 'playPause': {
          const tab = await getActiveTab();
          const state = await getState();
          if (state.paused) {
            await sendToTab(tab, { type: 'rec:resume' });
            await setState({ paused: false });
          } else {
            await sendToTab(tab, { type: 'rec:pause' });
            await setState({ paused: true });
          }
          sendResponse({ ok: true, paused: !state.paused });
          break;
        }

        case 'playStep': {
          const tab = await getActiveTab();
          await sendToTab(tab, { type: 'rec:nextStep' });
          sendResponse({ ok: true });
          break;
        }

        // === ACTIONS ===
        case 'clearRecording': {
          await chrome.storage.local.remove(ACTIONS_KEY);
          const state = await setState({ actionsCount: 0 });
          const tab = await getActiveTab();
          if (tab?.id) {
            try { await sendToTab(tab, { type: 'rec:cleared' }); } catch (e) { /* ignore */ }
          }
          sendResponse({ ok: true, state });
          break;
        }

        case 'getActions': {
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          sendResponse({ ok: true, actions: actionsStore[ACTIONS_KEY] || [] });
          break;
        }

        case 'setActions': {
          await chrome.storage.local.set({ [ACTIONS_KEY]: msg.actions || [] });
          await setState({ actionsCount: (msg.actions || []).length });
          sendResponse({ ok: true });
          break;
        }

        case 'addAction': {
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = actionsStore[ACTIONS_KEY] || [];
          actions.push({ ...msg.action, id: cryptoRandomId(), timestamp: Date.now() });
          await chrome.storage.local.set({ [ACTIONS_KEY]: actions });
          await setState({ actionsCount: actions.length });
          sendResponse({ ok: true, count: actions.length });
          break;
        }

        case 'updateAction': {
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = actionsStore[ACTIONS_KEY] || [];
          const index = actions.findIndex(a => a.id === msg.actionId);
          if (index !== -1) {
            actions[index] = { ...actions[index], ...msg.updates };
            await chrome.storage.local.set({ [ACTIONS_KEY]: actions });
          }
          sendResponse({ ok: true });
          break;
        }

        case 'deleteAction': {
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = actionsStore[ACTIONS_KEY] || [];
          const filtered = actions.filter(a => a.id !== msg.actionId);
          await chrome.storage.local.set({ [ACTIONS_KEY]: filtered });
          await setState({ actionsCount: filtered.length });
          sendResponse({ ok: true });
          break;
        }

        case 'reorderActions': {
          await chrome.storage.local.set({ [ACTIONS_KEY]: msg.actions });
          sendResponse({ ok: true });
          break;
        }

        // === MACROS ===
        case 'getMacros': {
          const macros = await getMacros();
          sendResponse({ ok: true, macros });
          break;
        }

        case 'saveMacro': {
          const actionsStore = await chrome.storage.local.get(ACTIONS_KEY);
          const actions = msg.actions || actionsStore[ACTIONS_KEY] || [];
          const macro = await saveMacro(msg.name, actions, msg.folderId, msg.tags);
          sendResponse({ ok: true, macro });
          break;
        }

        case 'updateMacro': {
          const macro = await updateMacro(msg.macroId, msg.updates);
          sendResponse({ ok: true, macro });
          break;
        }

        case 'deleteMacro': {
          await deleteMacro(msg.macroId);
          sendResponse({ ok: true });
          break;
        }

        case 'duplicateMacro': {
          const macro = await duplicateMacro(msg.macroId);
          sendResponse({ ok: true, macro });
          break;
        }

        case 'importMacros': {
          const existing = await getMacros();
          const imported = (msg.macros || []).map(m => ({
            ...m,
            id: cryptoRandomId(),
            importedAt: new Date().toISOString(),
          }));
          await setMacros([...existing, ...imported]);
          sendResponse({ ok: true, count: imported.length });
          break;
        }

        case 'exportMacros': {
          const macros = await getMacros();
          const toExport = msg.macroIds
            ? macros.filter(m => msg.macroIds.includes(m.id))
            : macros;
          sendResponse({ ok: true, macros: toExport });
          break;
        }

        // === FOLDERS ===
        case 'getFolders': {
          const folders = await getFolders();
          sendResponse({ ok: true, folders });
          break;
        }

        case 'createFolder': {
          const folder = await createFolder(msg.name, msg.parentId);
          sendResponse({ ok: true, folder });
          break;
        }

        case 'deleteFolder': {
          await deleteFolder(msg.folderId);
          sendResponse({ ok: true });
          break;
        }

        case 'renameFolder': {
          const folders = await getFolders();
          const index = folders.findIndex(f => f.id === msg.folderId);
          if (index !== -1) {
            folders[index].name = msg.name;
            await setFolders(folders);
          }
          sendResponse({ ok: true });
          break;
        }

        // === VARIABLES ===
        case 'getVariables': {
          const vars = await getVariables();
          sendResponse({ ok: true, variables: vars });
          break;
        }

        case 'setVariables': {
          await setVariables(msg.variables || {});
          const tab = await getActiveTab();
          if (tab?.id) {
            try { await sendToTab(tab, { type: 'rec:setVariables', variables: msg.variables }); } catch (e) { /* ignore */ }
          }
          sendResponse({ ok: true });
          break;
        }

        case 'clearVariables': {
          await clearVariables();
          sendResponse({ ok: true });
          break;
        }

        // === SETTINGS ===
        case 'getSettings': {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          break;
        }

        case 'setSettings': {
          await setSettings(msg.settings);
          sendResponse({ ok: true });
          break;
        }

        // === DEBUG ===
        case 'getDebugLog': {
          const log = await getDebugLog();
          sendResponse({ ok: true, log });
          break;
        }

        case 'clearDebugLog': {
          await clearDebugLog();
          sendResponse({ ok: true });
          break;
        }

        // === ELEMENT CAPTURE ===
        case 'captureElement': {
          const tab = await getActiveTab();
          await sendToTab(tab, { type: 'rec:captureElement' });
          sendResponse({ ok: true });
          break;
        }

        case 'highlightElement': {
          const tab = await getActiveTab();
          await sendToTab(tab, { type: 'rec:highlight', selector: msg.selector, selectorType: msg.selectorType });
          sendResponse({ ok: true });
          break;
        }

        // === CONTENT SCRIPT EVENTS ===
        case 'rec:count': {
          await setState({ actionsCount: msg.count || 0 });
          break;
        }

        case 'rec:playDone': {
          await setState({ playing: false, paused: false, currentMacroId: null });
          await addDebugLog({ type: 'playback_done', stepsCompleted: msg.stepsCompleted, totalSteps: msg.totalSteps });
          break;
        }

        case 'rec:error': {
          await addDebugLog({ type: 'error', step: msg.step, action: msg.action, error: msg.error });
          break;
        }

        case 'rec:elementCaptured': {
          // Relay to popup
          // Will be handled by popup listener
          break;
        }

        default:
          console.log('[Plugin Rec Pro] Unknown message type:', msg.type);
      }
    } catch (error) {
      console.error('[Plugin Rec Pro] Error handling message:', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();

  return true; // Keep channel open for async response
});

// ============== TAB EVENTS ==============

// Sync recording state when tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const state = await getState();
  if (state.recording) {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (isScriptableUrl(tab.url)) {
        await ensureContentScript(activeInfo.tabId);
        await chrome.tabs.sendMessage(activeInfo.tabId, { type: 'rec:start', debug: state.debugMode });
      }
    } catch (e) {
      console.warn('[Plugin Rec Pro] Could not start recording on new tab:', e);
    }
  }
});

// Handle navigation during recording
chrome.webNavigation?.onCompleted?.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame

  const state = await getState();
  if (state.recording) {
    try {
      await ensureContentScript(details.tabId);
      await chrome.tabs.sendMessage(details.tabId, { type: 'rec:start', debug: state.debugMode });
    } catch (e) {
      console.warn('[Plugin Rec Pro] Could not restart recording after navigation:', e);
    }
  }
});

console.log('[Plugin Rec Pro] Background service worker v2.0 loaded');
