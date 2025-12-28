async function getActions() {
  const obj = await chrome.storage.local.get(ACTIONS_KEY);
  return obj[ACTIONS_KEY] || [];
}

async function setActions(list) {
  await chrome.storage.local.set({ [ACTIONS_KEY]: list });
  chrome.runtime.sendMessage({ type: 'rec:count', count: list.length });
}

function liForStep(step, idx) {
  const li = document.createElement('li');
  li.className = 'step';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${idx + 1}. ${step.type} ${step.selector ? '| ' + step.selector : ''} ${step.text ? '| ' + step.text : ''}`;
  const btnUp = document.createElement('button'); btnUp.textContent = '↑';
  const btnDown = document.createElement('button'); btnDown.textContent = '↓';
  const btnDel = document.createElement('button'); btnDel.textContent = 'Del';
  btnUp.addEventListener('click', async () => { const a = await getActions(); if (idx <= 0) return; const t=a[idx]; a[idx]=a[idx-1]; a[idx-1]=t; await setActions(a); await renderSteps(); });
  btnDown.addEventListener('click', async () => { const a = await getActions(); if (idx >= a.length-1) return; const t=a[idx]; a[idx]=a[idx+1]; a[idx+1]=t; await setActions(a); await renderSteps(); });
  btnDel.addEventListener('click', async () => { const a = await getActions(); a.splice(idx,1); await setActions(a); await renderSteps(); });
  li.append(meta, btnUp, btnDown, btnDel);
  return li;
}

async function renderSteps() {
  const actions = await getActions();
  ulSteps.innerHTML = '';
  actions.forEach((s, i) => ulSteps.appendChild(liForStep(s, i)));
  const counter = document.getElementById('stepsCount');
  if (counter) counter.textContent = String(actions.length);
}
 
// popup.js

const elRec = document.getElementById('rec');
const elCount = document.getElementById('count');
const btnStart = document.getElementById('start');
const btnStop = document.getElementById('stop');
const btnPlay = document.getElementById('play');
const btnClear = document.getElementById('clear');
const inStepDelay = document.getElementById('stepDelay');
const inFindTimeout = document.getElementById('findTimeout');
const selTypingMode = document.getElementById('typingMode');
const themeToggle = document.getElementById('themeToggle');
const btnExport = document.getElementById('export');
const btnImport = document.getElementById('import');
const inImportFile = document.getElementById('importFile');
const ulSteps = document.getElementById('steps');
const inWaitSelector = document.getElementById('waitSelector');
const btnAddWaitSelector = document.getElementById('addWaitSelector');
const inWaitText = document.getElementById('waitText');
const inWaitTextSelector = document.getElementById('waitTextSelector');
const btnAddWaitText = document.getElementById('addWaitText');

const ACTIONS_KEY = 'plugin_rec_pro_actions';
const SETTINGS_KEY = 'plugin_rec_pro_settings';

function setStatus(st) {
  if (!st) return;
  elRec.textContent = String(!!st.recording);
  elCount.textContent = String(st.actionsCount || 0);
  const ind = document.getElementById('recIndicator');
  if (ind) {
    if (st.recording) ind.classList.add('on'); else ind.classList.remove('on');
  }
}

function getStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
      resolve(res?.state || { recording: false, actionsCount: 0 });
    });
  });
}

async function refresh() {
  const st = await getStatus();
  setStatus(st);
  // load settings
  const obj = await chrome.storage.local.get(SETTINGS_KEY);
  const s = obj[SETTINGS_KEY] || {};
  inStepDelay.value = (typeof s.stepDelay === 'number' ? s.stepDelay : 300);
  inFindTimeout.value = (typeof s.findTimeout === 'number' ? s.findTimeout : 3000);
  selTypingMode.value = (s.typingMode === 'type' || s.typingMode === 'set') ? s.typingMode : 'set';
  // theme
  const theme = (s.theme === 'light' || s.theme === 'dark') ? s.theme : 'dark';
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  if (themeToggle) themeToggle.checked = (theme === 'dark');
  await renderSteps();
}

btnStart.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'startRecording' }, (res) => {
    if (res?.state) setStatus(res.state);
  });
});

btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'stopRecording' }, (res) => {
    if (res?.state) setStatus(res.state);
  });
});

btnPlay.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'playRecording' });
});

btnClear.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clearRecording' }, (res) => {
    if (res?.state) setStatus(res.state);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'rec:count') {
    elCount.textContent = String(msg.count || 0);
  }
});

function saveSettings() {
  const stepDelay = Number(inStepDelay.value) || 0;
  const findTimeout = Number(inFindTimeout.value) || 0;
  const typingMode = selTypingMode.value === 'type' ? 'type' : 'set';
  const theme = (themeToggle && themeToggle.checked) ? 'dark' : 'light';
  chrome.storage.local.set({ [SETTINGS_KEY]: { stepDelay, findTimeout, typingMode, theme } });
}

inStepDelay.addEventListener('change', saveSettings);
inFindTimeout.addEventListener('change', saveSettings);
selTypingMode.addEventListener('change', saveSettings);
if (themeToggle) {
  themeToggle.addEventListener('change', () => {
    // Apply immediately and persist
    document.documentElement.setAttribute('data-theme', themeToggle.checked ? '' : 'light');
    saveSettings();
  });
}

async function exportActions() {
  const obj = await chrome.storage.local.get(ACTIONS_KEY);
  const actions = obj[ACTIONS_KEY] || [];
  const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plugin-rec-pro-actions.json';
  a.click();
  URL.revokeObjectURL(url);
}

btnExport.addEventListener('click', exportActions);

btnImport.addEventListener('click', () => inImportFile.click());

inImportFile.addEventListener('change', async () => {
  const file = inImportFile.files && inImportFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Invalid JSON format');
    await chrome.storage.local.set({ [ACTIONS_KEY]: data });
    chrome.runtime.sendMessage({ type: 'rec:count', count: data.length });
  } catch (e) {
    console.error('Import failed', e);
  } finally {
    inImportFile.value = '';
  }
  await renderSteps();
});

// Register waits buttons after DOM elements are defined
btnAddWaitSelector.addEventListener('click', async () => {
  const sel = (inWaitSelector.value || '').trim();
  if (!sel) return;
  const a = await getActions();
  a.push({ type: 'waitForSelector', selector: sel });
  await setActions(a);
  inWaitSelector.value = '';
  await renderSteps();
});

btnAddWaitText.addEventListener('click', async () => {
  const txt = (inWaitText.value || '').trim();
  const scope = (inWaitTextSelector.value || '').trim();
  if (!txt) return;
  const a = await getActions();
  a.push({ type: 'waitForText', text: txt, selector: scope || undefined });
  await setActions(a);
  inWaitText.value = '';
  inWaitTextSelector.value = '';
  await renderSteps();
});

refresh();
