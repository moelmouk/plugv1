// popup.js - Plugin Rec Pro v2.0
// Interface utilisateur complète avec gestion macros, variables, debug

(() => {
  'use strict';

  const ACTIONS_KEY = 'plugin_rec_pro_actions';
  const SETTINGS_KEY = 'plugin_rec_pro_settings';

  // DOM Elements
  const elements = {};
  let currentTab = 'record';
  let selectedActionType = 'waitForSelector';
  let editingActionId = null;
  let draggedItem = null;

  // ============== INITIALIZATION ==============

  function initElements() {
    // Header
    elements.recIndicator = document.getElementById('recIndicator');
    elements.themeToggle = document.getElementById('themeToggle');

    // Tabs
    elements.tabs = document.querySelectorAll('.tab');
    elements.tabPanels = document.querySelectorAll('.tab-panel');
    elements.macrosCount = document.getElementById('macrosCount');

    // Record Tab
    elements.statusDot = document.getElementById('statusDot');
    elements.statusText = document.getElementById('statusText');
    elements.actionsCount = document.getElementById('actionsCount');
    elements.btnStart = document.getElementById('btnStart');
    elements.btnStop = document.getElementById('btnStop');
    elements.btnPlay = document.getElementById('btnPlay');
    elements.btnClear = document.getElementById('btnClear');
    elements.btnPause = document.getElementById('btnPause');
    elements.btnStep = document.getElementById('btnStep');
    elements.btnStopPlay = document.getElementById('btnStopPlay');
    elements.stepDelay = document.getElementById('stepDelay');
    elements.findTimeout = document.getElementById('findTimeout');
    elements.typingMode = document.getElementById('typingMode');
    elements.btnExport = document.getElementById('btnExport');
    elements.btnImport = document.getElementById('btnImport');
    elements.importFile = document.getElementById('importFile');
    elements.actionTypes = document.getElementById('actionTypes');
    elements.actionForm = document.getElementById('actionForm');
    elements.btnAddAction = document.getElementById('btnAddAction');
    elements.stepsList = document.getElementById('stepsList');
    elements.stepsCount = document.getElementById('stepsCount');

    // Macros Tab
    elements.macroSearch = document.getElementById('macroSearch');
    elements.btnNewFolder = document.getElementById('btnNewFolder');
    elements.btnSaveMacro = document.getElementById('btnSaveMacro');
    elements.foldersList = document.getElementById('foldersList');
    elements.macrosList = document.getElementById('macrosList');
    elements.macrosTotalCount = document.getElementById('macrosTotalCount');

    // Variables Tab
    elements.newVarName = document.getElementById('newVarName');
    elements.newVarValue = document.getElementById('newVarValue');
    elements.btnAddVar = document.getElementById('btnAddVar');
    elements.varsList = document.getElementById('varsList');
    elements.varsCount = document.getElementById('varsCount');

    // Debug Tab
    elements.debugHighlight = document.getElementById('debugHighlight');
    elements.debugContinueOnError = document.getElementById('debugContinueOnError');
    elements.btnDebugPlay = document.getElementById('btnDebugPlay');
    elements.btnClearLog = document.getElementById('btnClearLog');
    elements.btnCaptureElement = document.getElementById('btnCaptureElement');
    elements.capturedElement = document.getElementById('capturedElement');
    elements.capturedSelector = document.getElementById('capturedSelector');
    elements.debugLog = document.getElementById('debugLog');
    elements.logsCount = document.getElementById('logsCount');

    // Modals
    elements.editActionModal = document.getElementById('editActionModal');
    elements.editActionForm = document.getElementById('editActionForm');
    elements.btnSaveEdit = document.getElementById('btnSaveEdit');
    elements.saveMacroModal = document.getElementById('saveMacroModal');
    elements.macroName = document.getElementById('macroName');
    elements.macroTags = document.getElementById('macroTags');
    elements.macroFolder = document.getElementById('macroFolder');
    elements.btnConfirmSaveMacro = document.getElementById('btnConfirmSaveMacro');
    elements.newFolderModal = document.getElementById('newFolderModal');
    elements.folderName = document.getElementById('folderName');
    elements.btnConfirmNewFolder = document.getElementById('btnConfirmNewFolder');
  }

  function initEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('change', toggleTheme);

    // Tabs
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Record controls
    elements.btnStart.addEventListener('click', startRecording);
    elements.btnStop.addEventListener('click', stopRecording);
    elements.btnPlay.addEventListener('click', playRecording);
    elements.btnClear.addEventListener('click', clearRecording);
    elements.btnPause.addEventListener('click', togglePause);
    elements.btnStep.addEventListener('click', stepForward);
    elements.btnStopPlay.addEventListener('click', stopPlayback);

    // Settings
    elements.stepDelay.addEventListener('change', saveSettings);
    elements.findTimeout.addEventListener('change', saveSettings);
    elements.typingMode.addEventListener('change', saveSettings);
    elements.debugHighlight.addEventListener('change', saveSettings);
    elements.debugContinueOnError.addEventListener('change', saveSettings);

    // Import/Export
    elements.btnExport.addEventListener('click', exportActions);
    elements.btnImport.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', importActions);

    // Action types
    elements.actionTypes.querySelectorAll('.action-type-btn').forEach(btn => {
      btn.addEventListener('click', () => selectActionType(btn.dataset.action));
    });
    elements.btnAddAction.addEventListener('click', addManualAction);

    // Macros
    elements.macroSearch.addEventListener('input', filterMacros);
    elements.btnNewFolder.addEventListener('click', () => openModal('newFolderModal'));
    elements.btnSaveMacro.addEventListener('click', () => openSaveMacroModal());
    elements.btnConfirmSaveMacro.addEventListener('click', confirmSaveMacro);
    elements.btnConfirmNewFolder.addEventListener('click', confirmNewFolder);

    // Variables
    elements.btnAddVar.addEventListener('click', addVariable);

    // Debug
    elements.btnDebugPlay.addEventListener('click', () => playRecording(true));
    elements.btnClearLog.addEventListener('click', clearDebugLog);
    elements.btnCaptureElement.addEventListener('click', captureElement);

    // Edit modal
    elements.btnSaveEdit.addEventListener('click', saveEditedAction);

    // Listen for messages from background/content
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // ============== TAB MANAGEMENT ==============

  function switchTab(tabId) {
    currentTab = tabId;

    elements.tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    elements.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    // Refresh data for the tab
    if (tabId === 'macros') {
      refreshMacros();
      refreshFolders();
    } else if (tabId === 'variables') {
      refreshVariables();
    } else if (tabId === 'debug') {
      refreshDebugLog();
    }
  }

  // ============== THEME ==============

  async function loadTheme() {
    const settings = await getSettings();
    const isDark = settings.theme !== 'light';
    elements.themeToggle.checked = isDark;
    document.documentElement.setAttribute('data-theme', isDark ? '' : 'light');
  }

  function toggleTheme() {
    const isDark = elements.themeToggle.checked;
    document.documentElement.setAttribute('data-theme', isDark ? '' : 'light');
    saveSettings();
  }

  // ============== STATUS ==============

  async function refreshStatus() {
    try {
      const response = await sendMessage({ type: 'getStatus' });
      if (response?.ok) {
        updateStatus(response.state);
      }
    } catch (e) {
      console.error('Error refreshing status:', e);
    }
  }

  function updateStatus(state) {
    if (!state) return;

    // Update recording indicator
    elements.recIndicator.classList.toggle('active', state.recording);

    // Update status dot and text
    elements.statusDot.classList.remove('recording', 'playing', 'paused');
    if (state.recording) {
      elements.statusDot.classList.add('recording');
      elements.statusText.textContent = 'Enregistrement...';
    } else if (state.playing) {
      if (state.paused) {
        elements.statusDot.classList.add('paused');
        elements.statusText.textContent = 'En pause';
      } else {
        elements.statusDot.classList.add('playing');
        elements.statusText.textContent = 'Lecture...';
      }
    } else {
      elements.statusText.textContent = 'Prêt';
    }

    // Update actions count
    elements.actionsCount.textContent = state.actionsCount || 0;
    elements.stepsCount.textContent = state.actionsCount || 0;

    // Update buttons state
    elements.btnStart.disabled = state.recording || state.playing;
    elements.btnStop.disabled = !state.recording;
    elements.btnPlay.disabled = state.recording || state.playing || state.actionsCount === 0;
    elements.btnClear.disabled = state.recording || state.playing;

    // Playback controls
    elements.btnPause.disabled = !state.playing;
    elements.btnPause.innerHTML = state.paused ? '<span>▶</span> Reprendre' : '<span>⏸</span> Pause';
    elements.btnStep.disabled = !state.playing || !state.paused;
    elements.btnStopPlay.disabled = !state.playing;
  }

  // ============== RECORDING ==============

  async function startRecording() {
    try {
      const response = await sendMessage({ type: 'startRecording', debug: elements.debugHighlight.checked });
      if (response?.ok) {
        updateStatus(response.state);
        refreshSteps();
      } else {
        alert('Erreur: ' + (response?.error || 'Impossible de démarrer'));
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async function stopRecording() {
    try {
      const response = await sendMessage({ type: 'stopRecording', saveMacro: false });
      if (response?.ok) {
        updateStatus(response.state);
        refreshSteps();
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async function playRecording(debugMode = false) {
    try {
      const response = await sendMessage({
        type: 'playRecording',
        debug: debugMode || elements.debugHighlight.checked
      });
      if (response?.ok) {
        refreshStatus();
      } else {
        alert('Erreur: ' + (response?.error || 'Impossible de jouer'));
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async function clearRecording() {
    if (!confirm('Effacer toutes les actions enregistrées ?')) return;

    try {
      const response = await sendMessage({ type: 'clearRecording' });
      if (response?.ok) {
        updateStatus(response.state);
        refreshSteps();
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async function togglePause() {
    try {
      const response = await sendMessage({ type: 'playPause' });
      if (response?.ok) {
        refreshStatus();
      }
    } catch (e) {
      console.error('Pause error:', e);
    }
  }

  async function stepForward() {
    try {
      await sendMessage({ type: 'playStep' });
    } catch (e) {
      console.error('Step error:', e);
    }
  }

  async function stopPlayback() {
    try {
      const response = await sendMessage({ type: 'playStop' });
      if (response?.ok) {
        refreshStatus();
      }
    } catch (e) {
      console.error('Stop error:', e);
    }
  }

  // ============== STEPS MANAGEMENT ==============

  async function refreshSteps() {
    try {
      const response = await sendMessage({ type: 'getActions' });
      if (response?.ok) {
        renderSteps(response.actions || []);
      }
    } catch (e) {
      console.error('Error refreshing steps:', e);
    }
  }

  function renderSteps(actions) {
    elements.stepsCount.textContent = actions.length;
    elements.actionsCount.textContent = actions.length;

    if (actions.length === 0) {
      elements.stepsList.innerHTML = `
        <li class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-text">Aucune action enregistrée</div>
        </li>
      `;
      return;
    }

    elements.stepsList.innerHTML = actions.map((action, index) => `
      <li class="step-item" draggable="true" data-id="${action.id}" data-index="${index}">
        <span class="step-number">${index + 1}</span>
        <span class="step-type ${action.type}">${action.type}</span>
        <div class="step-info">
          <div class="step-selector" title="${escapeHtml(action.selector || '')}">
            ${escapeHtml(truncate(action.selector || action.url || action.condition || action.varName || '', 35))}
          </div>
          <div class="step-value" title="${escapeHtml(String(action.value ?? action.text ?? action.count ?? ''))}">
            ${escapeHtml(truncate(String(action.value ?? action.text ?? action.count ?? ''), 30))}
          </div>
        </div>
        <div class="step-actions">
          <button class="step-btn" onclick="editStep('${action.id}')" title="Modifier">✏️</button>
          <button class="step-btn" onclick="moveStep('${action.id}', -1)" title="Monter">⬆</button>
          <button class="step-btn" onclick="moveStep('${action.id}', 1)" title="Descendre">⬇</button>
          <button class="step-btn delete" onclick="deleteStep('${action.id}')" title="Supprimer">🗑</button>
        </div>
      </li>
    `).join('');

    // Add drag & drop handlers
    initDragDrop();
  }

  function initDragDrop() {
    const items = elements.stepsList.querySelectorAll('.step-item');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem === item) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
          item.parentNode.insertBefore(draggedItem, item);
        } else {
          item.parentNode.insertBefore(draggedItem, item.nextSibling);
        }
      });

      item.addEventListener('drop', async () => {
        // Save new order
        const newOrder = Array.from(elements.stepsList.querySelectorAll('.step-item'))
          .map(el => el.dataset.id);

        const response = await sendMessage({ type: 'getActions' });
        if (response?.ok) {
          const actions = response.actions;
          const reordered = newOrder.map(id => actions.find(a => a.id === id)).filter(Boolean);
          await sendMessage({ type: 'reorderActions', actions: reordered });
          refreshSteps();
        }
      });
    });
  }

  // Global functions for onclick
  window.editStep = async function(id) {
    const response = await sendMessage({ type: 'getActions' });
    if (!response?.ok) return;

    const action = response.actions.find(a => a.id === id);
    if (!action) return;

    editingActionId = id;
    renderEditForm(action);
    openModal('editActionModal');
  };

  window.moveStep = async function(id, direction) {
    const response = await sendMessage({ type: 'getActions' });
    if (!response?.ok) return;

    const actions = response.actions;
    const index = actions.findIndex(a => a.id === id);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= actions.length) return;

    // Swap
    [actions[index], actions[newIndex]] = [actions[newIndex], actions[index]];

    await sendMessage({ type: 'reorderActions', actions });
    refreshSteps();
  };

  window.deleteStep = async function(id) {
    await sendMessage({ type: 'deleteAction', actionId: id });
    refreshSteps();
    refreshStatus();
  };

  // ============== ACTION FORM ==============

  function selectActionType(type) {
    selectedActionType = type;

    elements.actionTypes.querySelectorAll('.action-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.action === type);
    });

    renderActionForm(type);
  }

  function renderActionForm(type) {
    const forms = {
      waitForSelector: `
        <div class="form-group">
          <label class="form-label">Sélecteur CSS ou XPath</label>
          <input type="text" id="actionSelector" class="input" placeholder="#myId, .myClass, //button[text()='OK']" />
        </div>
      `,
      waitForText: `
        <div class="form-group">
          <label class="form-label">Texte à attendre</label>
          <input type="text" id="actionText" class="input" placeholder="Chargement terminé..." />
        </div>
        <div class="form-group">
          <label class="form-label">Sélecteur (optionnel)</label>
          <input type="text" id="actionSelector" class="input" placeholder="Limiter la recherche à cet élément" />
        </div>
      `,
      navigate: `
        <div class="form-group">
          <label class="form-label">URL</label>
          <input type="text" id="actionUrl" class="input" placeholder="https://example.com" />
        </div>
      `,
      click: `
        <div class="form-group">
          <label class="form-label">Sélecteur de l'élément à cliquer</label>
          <input type="text" id="actionSelector" class="input" placeholder="#submitBtn, button[type='submit']" />
        </div>
      `,
      input: `
        <div class="form-group">
          <label class="form-label">Sélecteur du champ</label>
          <input type="text" id="actionSelector" class="input" placeholder="#email, input[name='username']" />
        </div>
        <div class="form-group">
          <label class="form-label">Valeur à saisir</label>
          <input type="text" id="actionValue" class="input" placeholder="user@example.com" />
        </div>
      `,
      store: `
        <div class="form-group">
          <label class="form-label">Nom de la variable</label>
          <input type="text" id="actionVarName" class="input" placeholder="maVariable" />
        </div>
        <div class="form-group">
          <label class="form-label">Valeur</label>
          <input type="text" id="actionValue" class="input" placeholder="valeur ou \${autreVariable}" />
        </div>
      `,
      if: `
        <div class="form-group">
          <label class="form-label">Condition (JavaScript)</label>
          <input type="text" id="actionCondition" class="input" placeholder="\${count} > 5" />
        </div>
        <p class="form-hint">Utilisez endif pour fermer le bloc if, else pour l'alternative.</p>
      `,
      times: `
        <div class="form-group">
          <label class="form-label">Nombre de répétitions</label>
          <input type="number" id="actionCount" class="input" min="1" value="3" />
        </div>
        <p class="form-hint">Utilisez endtimes pour fermer la boucle, break pour en sortir.</p>
      `,
      pause: `
        <div class="form-group">
          <label class="form-label">Durée (ms)</label>
          <input type="number" id="actionDuration" class="input" min="0" step="100" value="1000" />
        </div>
      `,
    };

    elements.actionForm.innerHTML = forms[type] || '<p class="form-hint">Sélectionnez un type d\'action</p>';
  }

  async function addManualAction() {
    const action = { type: selectedActionType };

    // Get form values based on action type
    const selector = document.getElementById('actionSelector')?.value?.trim();
    const value = document.getElementById('actionValue')?.value;
    const text = document.getElementById('actionText')?.value;
    const url = document.getElementById('actionUrl')?.value?.trim();
    const varName = document.getElementById('actionVarName')?.value?.trim();
    const condition = document.getElementById('actionCondition')?.value?.trim();
    const count = document.getElementById('actionCount')?.value;
    const duration = document.getElementById('actionDuration')?.value;

    if (selector) action.selector = selector;
    if (value !== undefined && value !== '') action.value = value;
    if (text) action.text = text;
    if (url) action.url = url;
    if (varName) action.varName = varName;
    if (condition) action.condition = condition;
    if (count) action.count = parseInt(count);
    if (duration) action.duration = parseInt(duration);

    // Validate
    if ((selectedActionType === 'click' || selectedActionType === 'input' || selectedActionType === 'waitForSelector') && !selector) {
      alert('Veuillez entrer un sélecteur');
      return;
    }
    if (selectedActionType === 'navigate' && !url) {
      alert('Veuillez entrer une URL');
      return;
    }
    if (selectedActionType === 'store' && !varName) {
      alert('Veuillez entrer un nom de variable');
      return;
    }

    await sendMessage({ type: 'addAction', action });
    refreshSteps();
    refreshStatus();

    // Clear form
    elements.actionForm.querySelectorAll('input').forEach(input => input.value = '');
  }

  function renderEditForm(action) {
    let html = `
      <div class="form-group">
        <label class="form-label">Type</label>
        <input type="text" class="input" value="${action.type}" disabled />
      </div>
    `;

    if (action.selector !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Sélecteur</label>
          <input type="text" id="editSelector" class="input" value="${escapeHtml(action.selector || '')}" />
        </div>
      `;
    }

    if (action.value !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Valeur</label>
          <input type="text" id="editValue" class="input" value="${escapeHtml(String(action.value))}" />
        </div>
      `;
    }

    if (action.text !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Texte</label>
          <input type="text" id="editText" class="input" value="${escapeHtml(action.text || '')}" />
        </div>
      `;
    }

    if (action.url !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">URL</label>
          <input type="text" id="editUrl" class="input" value="${escapeHtml(action.url || '')}" />
        </div>
      `;
    }

    if (action.condition !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Condition</label>
          <input type="text" id="editCondition" class="input" value="${escapeHtml(action.condition || '')}" />
        </div>
      `;
    }

    if (action.count !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input type="number" id="editCount" class="input" value="${action.count}" />
        </div>
      `;
    }

    if (action.duration !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Durée (ms)</label>
          <input type="number" id="editDuration" class="input" value="${action.duration}" />
        </div>
      `;
    }

    if (action.varName !== undefined) {
      html += `
        <div class="form-group">
          <label class="form-label">Nom variable</label>
          <input type="text" id="editVarName" class="input" value="${escapeHtml(action.varName || '')}" />
        </div>
      `;
    }

    elements.editActionForm.innerHTML = html;
  }

  async function saveEditedAction() {
    if (!editingActionId) return;

    const updates = {};

    const selector = document.getElementById('editSelector')?.value;
    const value = document.getElementById('editValue')?.value;
    const text = document.getElementById('editText')?.value;
    const url = document.getElementById('editUrl')?.value;
    const condition = document.getElementById('editCondition')?.value;
    const count = document.getElementById('editCount')?.value;
    const duration = document.getElementById('editDuration')?.value;
    const varName = document.getElementById('editVarName')?.value;

    if (selector !== undefined) updates.selector = selector;
    if (value !== undefined) updates.value = value;
    if (text !== undefined) updates.text = text;
    if (url !== undefined) updates.url = url;
    if (condition !== undefined) updates.condition = condition;
    if (count !== undefined) updates.count = parseInt(count);
    if (duration !== undefined) updates.duration = parseInt(duration);
    if (varName !== undefined) updates.varName = varName;

    await sendMessage({ type: 'updateAction', actionId: editingActionId, updates });

    closeModal('editActionModal');
    editingActionId = null;
    refreshSteps();
  }

  // ============== IMPORT/EXPORT ==============

  async function exportActions() {
    const response = await sendMessage({ type: 'getActions' });
    if (!response?.ok) return;

    const actions = response.actions || [];
    const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plugin-rec-pro-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importActions() {
    const file = elements.importFile.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('Format JSON invalide');
      }

      await sendMessage({ type: 'setActions', actions: data });
      refreshSteps();
      refreshStatus();
      alert(`${data.length} actions importées avec succès`);
    } catch (e) {
      alert('Erreur d\'import: ' + e.message);
    } finally {
      elements.importFile.value = '';
    }
  }

  // ============== MACROS ==============

  async function refreshMacros() {
    const response = await sendMessage({ type: 'getMacros' });
    if (!response?.ok) return;

    const macros = response.macros || [];
    elements.macrosCount.textContent = macros.length;
    elements.macrosTotalCount.textContent = macros.length;

    if (macros.length === 0) {
      elements.macrosList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <div class="empty-text">Aucune macro sauvegardée</div>
        </div>
      `;
      return;
    }

    elements.macrosList.innerHTML = macros.map(macro => `
      <div class="macro-item" data-id="${macro.id}">
        <span class="macro-icon">📜</span>
        <div class="macro-info">
          <div class="macro-name">${escapeHtml(macro.name)}</div>
          <div class="macro-meta">
            <span>${macro.count} actions</span>
            <span>${formatDate(macro.createdAt)}</span>
          </div>
          ${macro.tags?.length ? `<div>${macro.tags.map(t => `<span class="macro-tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
        </div>
        <div class="macro-actions">
          <button class="btn btn-sm btn-success" onclick="playMacro('${macro.id}')" title="Jouer">▶</button>
          <button class="btn btn-sm" onclick="loadMacro('${macro.id}')" title="Charger">📥</button>
          <button class="btn btn-sm" onclick="duplicateMacro('${macro.id}')" title="Dupliquer">📋</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMacro('${macro.id}')" title="Supprimer">🗑</button>
        </div>
      </div>
    `).join('');
  }

  async function refreshFolders() {
    const response = await sendMessage({ type: 'getFolders' });
    if (!response?.ok) return;

    const folders = response.folders || [];

    // Update folder select in modal
    elements.macroFolder.innerHTML = '<option value="">-- Aucun --</option>' +
      folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    // Render folders list
    if (folders.length > 0) {
      elements.foldersList.innerHTML = folders.map(folder => `
        <div class="folder-item" data-id="${folder.id}">
          <span class="folder-icon">📁</span>
          <span>${escapeHtml(folder.name)}</span>
          <button class="step-btn delete" onclick="deleteFolder('${folder.id}')" style="margin-left: auto;">🗑</button>
        </div>
      `).join('');
    } else {
      elements.foldersList.innerHTML = '';
    }
  }

  function filterMacros() {
    const query = elements.macroSearch.value.toLowerCase();
    const items = elements.macrosList.querySelectorAll('.macro-item');

    items.forEach(item => {
      const name = item.querySelector('.macro-name')?.textContent?.toLowerCase() || '';
      const tags = Array.from(item.querySelectorAll('.macro-tag')).map(t => t.textContent.toLowerCase()).join(' ');
      const matches = name.includes(query) || tags.includes(query);
      item.style.display = matches ? '' : 'none';
    });
  }

  function openSaveMacroModal() {
    elements.macroName.value = `Macro ${new Date().toLocaleString('fr-FR')}`;
    elements.macroTags.value = '';
    refreshFolders();
    openModal('saveMacroModal');
  }

  async function confirmSaveMacro() {
    const name = elements.macroName.value.trim();
    const tags = elements.macroTags.value.split(',').map(t => t.trim()).filter(Boolean);
    const folderId = elements.macroFolder.value || null;

    if (!name) {
      alert('Veuillez entrer un nom');
      return;
    }

    const response = await sendMessage({ type: 'saveMacro', name, tags, folderId });
    if (response?.ok) {
      closeModal('saveMacroModal');
      refreshMacros();
      alert('Macro sauvegardée!');
    } else {
      alert('Erreur: ' + (response?.error || 'Impossible de sauvegarder'));
    }
  }

  async function confirmNewFolder() {
    const name = elements.folderName.value.trim();
    if (!name) {
      alert('Veuillez entrer un nom');
      return;
    }

    await sendMessage({ type: 'createFolder', name });
    closeModal('newFolderModal');
    elements.folderName.value = '';
    refreshFolders();
  }

  // Global functions
  window.playMacro = async function(id) {
    const response = await sendMessage({ type: 'playMacro', macroId: id, debug: elements.debugHighlight.checked });
    if (response?.ok) {
      switchTab('record');
      refreshStatus();
    } else {
      alert('Erreur: ' + (response?.error || 'Impossible de jouer'));
    }
  };

  window.loadMacro = async function(id) {
    const macrosResponse = await sendMessage({ type: 'getMacros' });
    if (!macrosResponse?.ok) return;

    const macro = macrosResponse.macros.find(m => m.id === id);
    if (!macro) return;

    await sendMessage({ type: 'setActions', actions: macro.actions });
    switchTab('record');
    refreshSteps();
    refreshStatus();
  };

  window.duplicateMacro = async function(id) {
    await sendMessage({ type: 'duplicateMacro', macroId: id });
    refreshMacros();
  };

  window.deleteMacro = async function(id) {
    if (!confirm('Supprimer cette macro ?')) return;
    await sendMessage({ type: 'deleteMacro', macroId: id });
    refreshMacros();
  };

  window.deleteFolder = async function(id) {
    if (!confirm('Supprimer ce dossier ? Les macros seront déplacées hors du dossier.')) return;
    await sendMessage({ type: 'deleteFolder', folderId: id });
    refreshFolders();
    refreshMacros();
  };

  // ============== VARIABLES ==============

  async function refreshVariables() {
    const response = await sendMessage({ type: 'getVariables' });
    if (!response?.ok) return;

    const vars = response.variables || {};
    const entries = Object.entries(vars);
    elements.varsCount.textContent = entries.length;

    if (entries.length === 0) {
      elements.varsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-text">Aucune variable définie</div>
        </div>
      `;
      return;
    }

    elements.varsList.innerHTML = entries.map(([name, value]) => `
      <div class="var-item">
        <span class="var-name">\${${escapeHtml(name)}}</span>
        <span class="var-value" title="${escapeHtml(String(value))}">${escapeHtml(truncate(String(value), 30))}</span>
        <button class="step-btn delete" onclick="deleteVariable('${escapeHtml(name)}')">🗑</button>
      </div>
    `).join('');
  }

  async function addVariable() {
    const name = elements.newVarName.value.trim();
    const value = elements.newVarValue.value;

    if (!name) {
      alert('Veuillez entrer un nom de variable');
      return;
    }

    const response = await sendMessage({ type: 'getVariables' });
    const vars = response?.variables || {};
    vars[name] = value;

    await sendMessage({ type: 'setVariables', variables: vars });

    elements.newVarName.value = '';
    elements.newVarValue.value = '';
    refreshVariables();
  }

  window.deleteVariable = async function(name) {
    const response = await sendMessage({ type: 'getVariables' });
    const vars = response?.variables || {};
    delete vars[name];
    await sendMessage({ type: 'setVariables', variables: vars });
    refreshVariables();
  };

  // ============== DEBUG ==============

  async function refreshDebugLog() {
    const response = await sendMessage({ type: 'getDebugLog' });
    if (!response?.ok) return;

    const log = response.log || [];
    elements.logsCount.textContent = log.length;

    if (log.length === 0) {
      elements.debugLog.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📜</div>
          <div class="empty-text">Aucun log</div>
        </div>
      `;
      return;
    }

    elements.debugLog.innerHTML = log.slice(-100).reverse().map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString('fr-FR');
      const typeClass = entry.type.includes('error') ? 'error' :
                        entry.type.includes('done') || entry.type.includes('success') ? 'success' :
                        entry.type.includes('warning') ? 'warning' : 'info';

      return `
        <div class="log-item">
          <span class="log-time">${time}</span>
          <span class="log-type ${typeClass}">${entry.type}</span>
          <span class="log-message">${escapeHtml(entry.error || entry.macroName || entry.tabUrl || `Steps: ${entry.stepsCompleted || entry.actionsCount || 0}`)}</span>
        </div>
      `;
    }).join('');
  }

  async function clearDebugLog() {
    await sendMessage({ type: 'clearDebugLog' });
    refreshDebugLog();
  }

  async function captureElement() {
    await sendMessage({ type: 'captureElement' });
    // The response will come via message listener
  }

  // ============== SETTINGS ==============

  async function getSettings() {
    const response = await sendMessage({ type: 'getSettings' });
    return response?.settings || {};
  }

  async function loadSettings() {
    const settings = await getSettings();

    elements.stepDelay.value = settings.stepDelay || 300;
    elements.findTimeout.value = settings.findTimeout || 5000;
    elements.typingMode.value = settings.typingMode || 'set';
    elements.debugHighlight.checked = settings.highlightElements !== false;
    elements.debugContinueOnError.checked = settings.continueOnError === true;
  }

  async function saveSettings() {
    const settings = {
      stepDelay: parseInt(elements.stepDelay.value) || 300,
      findTimeout: parseInt(elements.findTimeout.value) || 5000,
      typingMode: elements.typingMode.value || 'set',
      highlightElements: elements.debugHighlight.checked,
      continueOnError: elements.debugContinueOnError.checked,
      theme: elements.themeToggle.checked ? 'dark' : 'light',
    };

    await sendMessage({ type: 'setSettings', settings });
  }

  // ============== MODALS ==============

  function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
  };

  // ============== MESSAGES ==============

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, resolve);
    });
  }

  function handleMessage(msg) {
    if (!msg?.type) return;

    switch (msg.type) {
      case 'rec:count':
        elements.actionsCount.textContent = msg.count || 0;
        elements.stepsCount.textContent = msg.count || 0;
        break;

      case 'rec:playDone':
        refreshStatus();
        refreshDebugLog();
        break;

      case 'rec:error':
        refreshDebugLog();
        break;

      case 'rec:elementCaptured':
        elements.capturedElement.style.display = 'block';
        elements.capturedSelector.value = msg.selector || '';
        break;

      case 'macros:updated':
        refreshMacros();
        break;
    }
  }

  // ============== UTILITIES ==============

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function truncate(str, max) {
    if (typeof str !== 'string') return '';
    return str.length > max ? str.slice(0, max) + '...' : str;
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ============== INIT ==============

  async function init() {
    initElements();
    initEventListeners();
    await loadTheme();
    await loadSettings();
    await refreshStatus();
    await refreshSteps();
    renderActionForm(selectedActionType);

    // Refresh macros count
    const macrosResponse = await sendMessage({ type: 'getMacros' });
    if (macrosResponse?.ok) {
      elements.macrosCount.textContent = (macrosResponse.macros || []).length;
    }
  }

  // Start
  document.addEventListener('DOMContentLoaded', init);
})();
