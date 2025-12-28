// content-script.js - Plugin Rec Pro v2.0
// Capture et replay avancés avec support Angular, variables, boucles, debug

(() => {
  'use strict';

  const ACTIONS_KEY = 'plugin_rec_pro_actions';
  const SETTINGS_KEY = 'plugin_rec_pro_settings';
  const VARIABLES_KEY = 'plugin_rec_pro_variables';

  let recording = false;
  let handlersAttached = false;
  let stopRequested = false;
  let pauseRequested = false;
  let debugMode = false;
  let currentStepIndex = 0;
  let totalSteps = 0;
  let highlightedElement = null;
  let tooltip = null;
  let stepIndicator = null;
  let lastScrollTime = 0;
  let dragStartElement = null;
  let dragStartPos = null;

  // Variables runtime
  let runtimeVariables = {};

  // ============== UTILITAIRES ==============

  function generateId() {
    return 'prp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // ============== SÉLECTEURS AVANCÉS ==============

  function getBestSelector(el) {
    if (!(el instanceof Element)) return '';

    // 1. Attributs Angular/Material prioritaires
    const angularAttrs = [
      'formcontrolname', 'ng-model', 'ng-click', 'ng-change', 'ng-submit',
      'mat-input', 'mat-select', 'mat-checkbox', 'mat-radio-button', 'mat-button',
      'mat-raised-button', 'mat-flat-button', 'mat-icon-button', 'mat-fab',
      'matinput', 'matsuffix', 'matprefix', 'ng-reflect-name',
      '[formcontrolname]', '[ngmodel]'
    ];

    // 2. Attributs de test prioritaires
    const testAttrs = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-automation-id'];

    // 3. Attributs stables
    const stableAttrs = ['aria-label', 'aria-labelledby', 'name', 'id', 'placeholder', 'role', 'type'];

    // Vérifier formControlName (Angular Reactive Forms)
    const fcName = el.getAttribute('formcontrolname') || el.getAttribute('ng-reflect-name');
    if (fcName) {
      return `[formcontrolname="${CSS.escape(fcName)}"]`;
    }

    // Vérifier ng-model (Angular Template Forms)
    const ngModel = el.getAttribute('ng-model');
    if (ngModel) {
      return `[ng-model="${CSS.escape(ngModel)}"]`;
    }

    // Vérifier attributs de test
    for (const attr of testAttrs) {
      const val = el.getAttribute(attr);
      if (val) return `[${attr}="${CSS.escape(val)}"]`;
    }

    // Vérifier attributs stables
    for (const attr of stableAttrs) {
      const val = el.getAttribute(attr);
      if (val && attr === 'id') {
        return `#${CSS.escape(val)}`;
      }
      if (val && val.length < 50) {
        return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
      }
    }

    // Construire un sélecteur CSS complet
    return buildCSSPath(el);
  }

  function buildCSSPath(el) {
    const parts = [];
    let current = el;
    let depth = 0;
    const maxDepth = 6;

    while (current && current.nodeType === 1 && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();

      // ID unique
      if (current.id && !current.id.match(/^\d/) && !current.id.includes(':')) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      // Classes significatives (éviter les classes dynamiques Angular/React)
      const classes = Array.from(current.classList || [])
        .filter(c => !c.match(/^(ng-|mat-|cdk-|_|\d)/i) && c.length < 30)
        .slice(0, 2);

      if (classes.length > 0) {
        selector += classes.map(c => `.${CSS.escape(c)}`).join('');
      }

      // nth-of-type pour désambiguïser
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  function buildTextXPath(el) {
    if (!(el instanceof Element)) return '';
    const tag = el.tagName.toLowerCase();
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > 80) return '';

    const escapedTxt = txt.replace(/"/g, '\\"');

    if (tag === 'button' || el.getAttribute('mat-button') !== null || el.getAttribute('mat-raised-button') !== null) {
      return `//button[normalize-space(.)="${escapedTxt}"]`;
    }
    if (tag === 'a') {
      return `//a[normalize-space(.)="${escapedTxt}"]`;
    }
    if (el.getAttribute('role') === 'button') {
      return `//*[@role="button" and normalize-space(.)="${escapedTxt}"]`;
    }
    if (tag === 'span' || tag === 'div') {
      return `//${tag}[normalize-space(.)="${escapedTxt}"]`;
    }
    return '';
  }

  function getXPath(el) {
    if (!(el instanceof Element)) return '';
    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 10) {
      let ix = 1;
      let sib = current.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.nodeName === current.nodeName) ix++;
        sib = sib.previousSibling;
      }
      parts.unshift(`${current.nodeName.toLowerCase()}[${ix}]`);
      current = current.parentElement;
      depth++;
    }
    return '//' + parts.join('/');
  }

  function getElementSelector(el) {
    const cssSelector = getBestSelector(el);
    const textXPath = buildTextXPath(el);
    const fullXPath = getXPath(el);

    // Préférer le sélecteur CSS s'il est court et stable
    if (cssSelector && cssSelector.length < 100) {
      return { selector: cssSelector, type: 'css' };
    }
    if (textXPath) {
      return { selector: textXPath, type: 'xpath' };
    }
    return { selector: fullXPath, type: 'xpath' };
  }

  // ============== STORAGE ==============

  async function getActions() {
    const obj = await chrome.storage.local.get(ACTIONS_KEY);
    return obj[ACTIONS_KEY] || [];
  }

  async function setActions(list) {
    await chrome.storage.local.set({ [ACTIONS_KEY]: list });
    chrome.runtime.sendMessage({ type: 'rec:count', count: list.length });
  }

  async function addAction(action) {
    const list = await getActions();
    list.push({ ...action, id: generateId(), timestamp: Date.now() });
    await setActions(list);
    return list.length;
  }

  async function getSettings() {
    const obj = await chrome.storage.local.get(SETTINGS_KEY);
    const s = obj[SETTINGS_KEY] || {};
    return {
      stepDelay: typeof s.stepDelay === 'number' ? s.stepDelay : 300,
      findTimeout: typeof s.findTimeout === 'number' ? s.findTimeout : 5000,
      typingMode: s.typingMode || 'set',
      typingSpeed: typeof s.typingSpeed === 'number' ? s.typingSpeed : 30,
      highlightElements: s.highlightElements !== false,
      screenshotOnError: s.screenshotOnError === true,
      continueOnError: s.continueOnError === true,
    };
  }

  async function getVariables() {
    const obj = await chrome.storage.local.get(VARIABLES_KEY);
    return obj[VARIABLES_KEY] || {};
  }

  async function setVariables(vars) {
    await chrome.storage.local.set({ [VARIABLES_KEY]: vars });
    runtimeVariables = vars;
  }

  // ============== ELEMENT FINDING ==============

  async function findElementWithRetry(selector, timeoutMs, selectorType = 'auto') {
    const isXPath = selectorType === 'xpath' || (selectorType === 'auto' && (selector.startsWith('//') || selector.startsWith('.//')));
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      let el = null;
      try {
        if (isXPath) {
          const res = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = res.singleNodeValue;
        } else {
          el = document.querySelector(selector);
        }
      } catch (e) {
        console.warn('Selector error:', selector, e);
      }

      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ============== UI FEEDBACK ==============

  function highlightElement(el, type = 'default') {
    removeHighlight();
    if (!el || !(el instanceof Element)) return;

    highlightedElement = el;
    const classMap = {
      'default': 'prp-highlight',
      'success': 'prp-highlight-success',
      'error': 'prp-highlight-error',
      'recording': 'prp-highlight-recording'
    };
    el.classList.add(classMap[type] || 'prp-highlight');
  }

  function removeHighlight() {
    if (highlightedElement) {
      highlightedElement.classList.remove('prp-highlight', 'prp-highlight-success', 'prp-highlight-error', 'prp-highlight-recording');
      highlightedElement = null;
    }
  }

  function showTooltip(text, x, y, type = 'default') {
    removeTooltip();
    tooltip = document.createElement('div');
    tooltip.className = `prp-tooltip ${type}`;
    tooltip.textContent = text;
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    document.body.appendChild(tooltip);
  }

  function removeTooltip() {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    tooltip = null;
  }

  function showStepIndicator(current, total, action, isPaused = false, isError = false) {
    removeStepIndicator();
    stepIndicator = document.createElement('div');
    stepIndicator.className = `prp-step-indicator${isPaused ? ' paused' : ''}${isError ? ' error' : ''}`;
    stepIndicator.innerHTML = `
      <span>Step ${current}/${total}</span>
      <span style="opacity:0.8">${action}</span>
      ${isPaused ? '<span>⏸ PAUSED</span>' : ''}
    `;
    document.body.appendChild(stepIndicator);
  }

  function removeStepIndicator() {
    if (stepIndicator && stepIndicator.parentNode) {
      stepIndicator.parentNode.removeChild(stepIndicator);
    }
    stepIndicator = null;
  }

  // ============== CAPTURE HANDLERS ==============

  function getElementInfo(el) {
    const { selector, type } = getElementSelector(el);
    return {
      selector,
      selectorType: type,
      tagName: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      id: el.id || '',
      name: el.getAttribute('name') || '',
      className: el.className || '',
      innerText: (el.innerText || '').substring(0, 100),
      angularModel: el.getAttribute('ng-model') || el.getAttribute('formcontrolname') || '',
    };
  }

  function captureClick(e) {
    if (!recording) return;

    const el = e.target;
    if (!(el instanceof Element)) return;

    // Ignorer les clics sur nos propres éléments UI
    if (el.closest('.prp-tooltip, .prp-step-indicator')) return;

    const info = getElementInfo(el);

    // Détecter le type de clic spécifique pour checkbox/radio
    let clickType = 'click';
    if (el.tagName === 'INPUT') {
      const inputType = el.getAttribute('type')?.toLowerCase();
      if (inputType === 'checkbox') clickType = 'checkbox';
      else if (inputType === 'radio') clickType = 'radio';
    }

    const entry = {
      type: clickType,
      ...info,
      button: e.button,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      checked: el.checked, // Pour checkbox/radio
    };

    if (debugMode) {
      highlightElement(el, 'recording');
      showTooltip(`Click: ${info.selector}`, e.clientX, e.clientY, 'recording');
      setTimeout(() => { removeHighlight(); removeTooltip(); }, 1000);
    }

    addAction(entry);
  }

  function captureDoubleClick(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest('.prp-tooltip, .prp-step-indicator')) return;

    const info = getElementInfo(el);
    addAction({ type: 'dblclick', ...info });
  }

  function captureContextMenu(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest('.prp-tooltip, .prp-step-indicator')) return;

    const info = getElementInfo(el);
    addAction({ type: 'rightclick', ...info, x: e.clientX, y: e.clientY });
  }

  function captureInput(e) {
    if (!recording) return;
    const el = e.target;

    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;

    const info = getElementInfo(el);
    let value = el.value;

    // Pour les selects multiples
    if (el instanceof HTMLSelectElement && el.multiple) {
      value = Array.from(el.selectedOptions).map(opt => opt.value);
    }

    const entry = {
      type: 'input',
      ...info,
      value,
      inputType: el.getAttribute('type') || 'text',
    };

    addAction(entry);
  }

  function captureChange(e) {
    if (!recording) return;
    const el = e.target;

    // Capturer les changements de checkbox/radio via change event aussi
    if (el instanceof HTMLInputElement) {
      const inputType = el.getAttribute('type')?.toLowerCase();
      if (inputType === 'checkbox' || inputType === 'radio') {
        const info = getElementInfo(el);
        addAction({
          type: inputType,
          ...info,
          checked: el.checked,
          value: el.value,
        });
        return;
      }
    }

    // Pour select, capturer le changement
    if (el instanceof HTMLSelectElement) {
      const info = getElementInfo(el);
      let value = el.value;
      if (el.multiple) {
        value = Array.from(el.selectedOptions).map(opt => opt.value);
      }
      addAction({
        type: 'select',
        ...info,
        value,
        selectedIndex: el.selectedIndex,
        selectedText: el.options[el.selectedIndex]?.text || '',
      });
    }
  }

  function captureKeydown(e) {
    if (!recording) return;

    // Capturer les touches spéciales
    const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

    // Capturer Ctrl+, Alt+, Meta+ combinaisons
    const hasModifier = e.ctrlKey || e.altKey || e.metaKey;

    if (!specialKeys.includes(e.key) && !hasModifier) return;

    const el = e.target;
    if (!(el instanceof Element)) return;

    const info = getElementInfo(el);
    addAction({
      type: 'key',
      ...info,
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
  }

  function captureScroll(e) {
    if (!recording) return;

    // Debounce scroll events
    const now = Date.now();
    if (now - lastScrollTime < 300) return;
    lastScrollTime = now;

    const target = e.target;
    let scrollX, scrollY, selector;

    if (target === document || target === document.documentElement || target === document.body) {
      scrollX = window.scrollX;
      scrollY = window.scrollY;
      selector = 'window';
    } else if (target instanceof Element) {
      scrollX = target.scrollLeft;
      scrollY = target.scrollTop;
      const info = getElementInfo(target);
      selector = info.selector;
    } else {
      return;
    }

    addAction({
      type: 'scroll',
      selector,
      scrollX,
      scrollY,
    });
  }

  function captureMouseover(e) {
    if (!recording) return;

    const el = e.target;
    if (!(el instanceof Element)) return;

    // Ne capturer que les hover sur des éléments interactifs ou avec des effets
    const isInteractive = el.matches('a, button, [role="button"], [onclick], [ng-click], [mat-button], [mat-raised-button], .dropdown, .menu-item, [data-toggle], [data-hover]');

    if (!isInteractive) return;

    const info = getElementInfo(el);
    addAction({
      type: 'hover',
      ...info,
    });
  }

  function captureDragStart(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof Element)) return;

    dragStartElement = el;
    dragStartPos = { x: e.clientX, y: e.clientY };
  }

  function captureDragEnd(e) {
    if (!recording || !dragStartElement) return;

    const startInfo = getElementInfo(dragStartElement);
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const endInfo = dropTarget ? getElementInfo(dropTarget) : null;

    addAction({
      type: 'drag',
      sourceSelector: startInfo.selector,
      sourceSelectorType: startInfo.selectorType,
      targetSelector: endInfo?.selector || '',
      targetSelectorType: endInfo?.selectorType || 'css',
      startX: dragStartPos.x,
      startY: dragStartPos.y,
      endX: e.clientX,
      endY: e.clientY,
    });

    dragStartElement = null;
    dragStartPos = null;
  }

  function captureFocus(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof Element)) return;

    // Ne capturer que les focus sur les champs de formulaire
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;

    const info = getElementInfo(el);
    addAction({
      type: 'focus',
      ...info,
    });
  }

  function captureBlur(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof Element)) return;

    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;

    const info = getElementInfo(el);
    addAction({
      type: 'blur',
      ...info,
    });
  }

  // ============== EVENT HANDLERS MANAGEMENT ==============

  function attachHandlers() {
    if (handlersAttached) return;
    handlersAttached = true;

    // Événements de clic
    window.addEventListener('click', captureClick, true);
    window.addEventListener('dblclick', captureDoubleClick, true);
    window.addEventListener('contextmenu', captureContextMenu, true);

    // Événements de saisie
    window.addEventListener('input', captureInput, true);
    window.addEventListener('change', captureChange, true);

    // Événements clavier
    window.addEventListener('keydown', captureKeydown, true);

    // Événements de scroll
    window.addEventListener('scroll', captureScroll, true);

    // Événements de survol (optionnel - peut être bruyant)
    // window.addEventListener('mouseover', captureMouseover, true);

    // Événements de drag & drop
    window.addEventListener('dragstart', captureDragStart, true);
    window.addEventListener('dragend', captureDragEnd, true);

    // Événements de focus
    window.addEventListener('focus', captureFocus, true);
    window.addEventListener('blur', captureBlur, true);

    console.log('[Plugin Rec Pro] Recording handlers attached');
  }

  function detachHandlers() {
    if (!handlersAttached) return;
    handlersAttached = false;

    window.removeEventListener('click', captureClick, true);
    window.removeEventListener('dblclick', captureDoubleClick, true);
    window.removeEventListener('contextmenu', captureContextMenu, true);
    window.removeEventListener('input', captureInput, true);
    window.removeEventListener('change', captureChange, true);
    window.removeEventListener('keydown', captureKeydown, true);
    window.removeEventListener('scroll', captureScroll, true);
    window.removeEventListener('dragstart', captureDragStart, true);
    window.removeEventListener('dragend', captureDragEnd, true);
    window.removeEventListener('focus', captureFocus, true);
    window.removeEventListener('blur', captureBlur, true);

    removeHighlight();
    removeTooltip();

    console.log('[Plugin Rec Pro] Recording handlers detached');
  }

  // ============== PLAYBACK ==============

  function replaceVariables(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return runtimeVariables[varName] !== undefined ? runtimeVariables[varName] : match;
    });
  }

  async function executeAction(action, settings) {
    const selector = replaceVariables(action.selector);
    let el = null;

    // Actions qui ne nécessitent pas d'élément
    const noElementActions = ['navigate', 'goto', 'back', 'forward', 'refresh', 'wait', 'pause', 'echo', 'store', 'storeEval', 'if', 'else', 'elseif', 'endif', 'while', 'endwhile', 'times', 'endtimes', 'break', 'continue', 'comment'];

    if (!noElementActions.includes(action.type) && selector && selector !== 'window') {
      el = await findElementWithRetry(selector, settings.findTimeout, action.selectorType);
      if (!el) {
        throw new Error(`Element not found: ${selector}`);
      }

      if (settings.highlightElements) {
        highlightElement(el);
      }

      // Scroll into view
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      await sleep(50);
    }

    switch (action.type) {
      case 'click':
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: action.button || 0,
          ctrlKey: action.ctrlKey || false,
          shiftKey: action.shiftKey || false,
          altKey: action.altKey || false,
        }));
        break;

      case 'dblclick':
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        break;

      case 'rightclick':
        el.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: action.x || 0,
          clientY: action.y || 0,
        }));
        break;

      case 'checkbox':
      case 'radio':
        if (el instanceof HTMLInputElement) {
          const shouldBeChecked = action.checked !== undefined ? action.checked : !el.checked;
          if (el.checked !== shouldBeChecked) {
            el.click();
          }
        }
        break;

      case 'input':
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          const targetVal = replaceVariables(action.value ?? '');

          if (settings.typingMode === 'type') {
            el.value = '';
            for (const ch of String(targetVal)) {
              el.value += ch;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
              await sleep(settings.typingSpeed || 30);
            }
          } else {
            el.value = targetVal;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          // Trigger Angular change detection
          triggerAngularChange(el);
        }
        break;

      case 'select':
        if (el instanceof HTMLSelectElement) {
          const targetVal = replaceVariables(action.value);
          if (Array.isArray(targetVal)) {
            // Multi-select
            Array.from(el.options).forEach(opt => {
              opt.selected = targetVal.includes(opt.value);
            });
          } else {
            el.value = targetVal;
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          triggerAngularChange(el);
        }
        break;

      case 'key':
        el.focus();
        const keyEvent = new KeyboardEvent('keydown', {
          key: action.key,
          code: action.code || action.key,
          bubbles: true,
          cancelable: true,
          ctrlKey: action.ctrlKey || false,
          shiftKey: action.shiftKey || false,
          altKey: action.altKey || false,
          metaKey: action.metaKey || false,
        });
        el.dispatchEvent(keyEvent);
        el.dispatchEvent(new KeyboardEvent('keyup', { ...keyEvent, type: 'keyup' }));

        // Simuler l'entrée pour Enter dans les formulaires
        if (action.key === 'Enter' && el.closest('form')) {
          const form = el.closest('form');
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        break;

      case 'scroll':
        if (selector === 'window') {
          window.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: 'smooth' });
        } else if (el) {
          el.scrollLeft = action.scrollX || 0;
          el.scrollTop = action.scrollY || 0;
        }
        break;

      case 'hover':
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(100);
        break;

      case 'focus':
        el.focus();
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        break;

      case 'blur':
        el.blur();
        el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        break;

      case 'drag':
        const sourceEl = await findElementWithRetry(action.sourceSelector, settings.findTimeout, action.sourceSelectorType);
        const targetEl = action.targetSelector ? await findElementWithRetry(action.targetSelector, settings.findTimeout, action.targetSelectorType) : null;

        if (sourceEl) {
          // Simuler drag & drop
          const dataTransfer = new DataTransfer();

          sourceEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));

          if (targetEl) {
            targetEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
            targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
            targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
          }

          sourceEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
        }
        break;

      // === NAVIGATION ===
      case 'navigate':
      case 'goto':
        window.location.href = replaceVariables(action.url || action.value);
        await sleep(1000);
        break;

      case 'back':
        window.history.back();
        await sleep(500);
        break;

      case 'forward':
        window.history.forward();
        await sleep(500);
        break;

      case 'refresh':
        window.location.reload();
        await sleep(1000);
        break;

      // === WAITS ===
      case 'wait':
      case 'pause':
        await sleep(action.duration || action.value || 1000);
        break;

      case 'waitForSelector':
        const waitEl = await findElementWithRetry(selector, settings.findTimeout, action.selectorType);
        if (!waitEl) {
          throw new Error(`waitForSelector timeout: ${selector}`);
        }
        break;

      case 'waitForText':
        const start = Date.now();
        const needle = String(replaceVariables(action.text || '')).trim();
        while (Date.now() - start < settings.findTimeout) {
          let found = false;
          if (selector) {
            const scopeEl = await findElementWithRetry(selector, 0, action.selectorType);
            found = scopeEl && scopeEl.textContent && scopeEl.textContent.includes(needle);
          } else {
            found = document.body.innerText.includes(needle);
          }
          if (found) break;
          await sleep(100);
        }
        break;

      case 'waitForVisible':
        const visStart = Date.now();
        while (Date.now() - visStart < settings.findTimeout) {
          const visEl = await findElementWithRetry(selector, 0, action.selectorType);
          if (visEl && visEl.offsetParent !== null) break;
          await sleep(100);
        }
        break;

      case 'waitForNotVisible':
        const nvStart = Date.now();
        while (Date.now() - nvStart < settings.findTimeout) {
          const nvEl = await findElementWithRetry(selector, 0, action.selectorType);
          if (!nvEl || nvEl.offsetParent === null) break;
          await sleep(100);
        }
        break;

      // === VARIABLES ===
      case 'store':
        runtimeVariables[action.varName] = replaceVariables(action.value);
        await setVariables(runtimeVariables);
        break;

      case 'storeText':
        if (el) {
          runtimeVariables[action.varName] = el.textContent?.trim() || '';
          await setVariables(runtimeVariables);
        }
        break;

      case 'storeValue':
        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
          runtimeVariables[action.varName] = el.value;
          await setVariables(runtimeVariables);
        }
        break;

      case 'storeAttribute':
        if (el) {
          runtimeVariables[action.varName] = el.getAttribute(action.attribute) || '';
          await setVariables(runtimeVariables);
        }
        break;

      case 'storeEval':
        try {
          const evalResult = eval(replaceVariables(action.expression));
          runtimeVariables[action.varName] = evalResult;
          await setVariables(runtimeVariables);
        } catch (e) {
          console.error('storeEval error:', e);
        }
        break;

      case 'echo':
        console.log('[Plugin Rec Pro]', replaceVariables(action.message || action.value));
        break;

      // === ASSERTIONS ===
      case 'assertText':
        if (el) {
          const actualText = el.textContent?.trim() || '';
          const expectedText = replaceVariables(action.expected || action.value);
          if (!actualText.includes(expectedText)) {
            throw new Error(`assertText failed: expected "${expectedText}" in "${actualText}"`);
          }
        }
        break;

      case 'assertValue':
        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
          const actualVal = el.value;
          const expectedVal = replaceVariables(action.expected || action.value);
          if (actualVal !== expectedVal) {
            throw new Error(`assertValue failed: expected "${expectedVal}" but got "${actualVal}"`);
          }
        }
        break;

      case 'assertVisible':
        if (!el || el.offsetParent === null) {
          throw new Error(`assertVisible failed: element not visible`);
        }
        break;

      case 'assertNotVisible':
        if (el && el.offsetParent !== null) {
          throw new Error(`assertNotVisible failed: element is visible`);
        }
        break;

      case 'assertChecked':
        if (el instanceof HTMLInputElement) {
          const shouldBeChecked = action.expected !== false;
          if (el.checked !== shouldBeChecked) {
            throw new Error(`assertChecked failed: expected ${shouldBeChecked} but got ${el.checked}`);
          }
        }
        break;

      case 'comment':
        // No-op, just for documentation
        break;

      default:
        console.warn('[Plugin Rec Pro] Unknown action type:', action.type);
    }

    if (settings.highlightElements && el) {
      highlightElement(el, 'success');
      await sleep(150);
      removeHighlight();
    }
  }

  function triggerAngularChange(el) {
    // Déclencher la détection de changements Angular
    try {
      // Angular 2+
      const ngZone = window['ng'];
      if (ngZone && ngZone.probe) {
        const component = ngZone.probe(el);
        if (component) {
          component.injector.get(ngZone.coreTokens.NgZone).run(() => {});
        }
      }
    } catch (e) {
      // Ignore - Angular may not be present
    }

    // Déclencher un événement custom pour les frameworks
    el.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true }));
  }

  // ============== CONTROL FLOW (LOOPS, CONDITIONS) ==============

  async function playActions(listOverride) {
    const [storedList, settings, storedVars] = await Promise.all([
      getActions(),
      getSettings(),
      getVariables()
    ]);

    const list = Array.isArray(listOverride) ? listOverride : storedList;
    runtimeVariables = { ...storedVars };
    stopRequested = false;
    pauseRequested = false;
    totalSteps = list.length;
    currentStepIndex = 0;

    // Stack pour gérer les boucles et conditions
    const controlStack = [];
    let skipUntil = null; // Pour sauter les blocs else/endif
    let loopData = null; // Pour les boucles times/while

    let i = 0;
    while (i < list.length) {
      if (stopRequested) {
        console.log('[Plugin Rec Pro] Playback stopped by user');
        break;
      }

      while (pauseRequested && !stopRequested) {
        showStepIndicator(i + 1, totalSteps, 'PAUSED', true);
        await sleep(200);
      }

      if (stopRequested) break;

      const action = list[i];
      currentStepIndex = i + 1;

      // Gestion du contrôle de flux
      if (action.type === 'if') {
        const condition = evaluateCondition(action.condition);
        controlStack.push({ type: 'if', condition, index: i });
        if (!condition) {
          skipUntil = 'else_or_endif';
        }
        i++;
        continue;
      }

      if (action.type === 'else') {
        const lastIf = controlStack[controlStack.length - 1];
        if (lastIf && lastIf.type === 'if') {
          if (lastIf.condition) {
            skipUntil = 'endif';
          } else {
            skipUntil = null;
          }
        }
        i++;
        continue;
      }

      if (action.type === 'elseif') {
        const lastIf = controlStack[controlStack.length - 1];
        if (lastIf && lastIf.type === 'if') {
          if (lastIf.condition) {
            skipUntil = 'endif';
          } else {
            const newCondition = evaluateCondition(action.condition);
            lastIf.condition = newCondition;
            skipUntil = newCondition ? null : 'else_or_endif';
          }
        }
        i++;
        continue;
      }

      if (action.type === 'endif') {
        controlStack.pop();
        skipUntil = null;
        i++;
        continue;
      }

      if (action.type === 'times') {
        const count = parseInt(replaceVariables(action.count || action.value)) || 1;
        controlStack.push({ type: 'times', count, current: 0, startIndex: i });
        i++;
        continue;
      }

      if (action.type === 'endtimes') {
        const loopInfo = controlStack[controlStack.length - 1];
        if (loopInfo && loopInfo.type === 'times') {
          loopInfo.current++;
          if (loopInfo.current < loopInfo.count) {
            i = loopInfo.startIndex + 1;
            continue;
          } else {
            controlStack.pop();
          }
        }
        i++;
        continue;
      }

      if (action.type === 'while') {
        const condition = evaluateCondition(action.condition);
        controlStack.push({ type: 'while', startIndex: i, condition });
        if (!condition) {
          skipUntil = 'endwhile';
        }
        i++;
        continue;
      }

      if (action.type === 'endwhile') {
        const loopInfo = controlStack[controlStack.length - 1];
        if (loopInfo && loopInfo.type === 'while') {
          const condition = evaluateCondition(list[loopInfo.startIndex].condition);
          if (condition) {
            i = loopInfo.startIndex + 1;
            continue;
          } else {
            controlStack.pop();
            skipUntil = null;
          }
        }
        i++;
        continue;
      }

      if (action.type === 'break') {
        // Sortir de la boucle actuelle
        for (let j = controlStack.length - 1; j >= 0; j--) {
          if (controlStack[j].type === 'times' || controlStack[j].type === 'while') {
            // Chercher endtimes ou endwhile correspondant
            const loopType = controlStack[j].type;
            const endType = loopType === 'times' ? 'endtimes' : 'endwhile';
            for (let k = i + 1; k < list.length; k++) {
              if (list[k].type === endType) {
                i = k + 1;
                controlStack.splice(j, 1);
                break;
              }
            }
            break;
          }
        }
        continue;
      }

      if (action.type === 'continue') {
        // Continuer à la prochaine itération
        for (let j = controlStack.length - 1; j >= 0; j--) {
          if (controlStack[j].type === 'times' || controlStack[j].type === 'while') {
            const loopType = controlStack[j].type;
            const endType = loopType === 'times' ? 'endtimes' : 'endwhile';
            for (let k = i + 1; k < list.length; k++) {
              if (list[k].type === endType) {
                i = k; // Aller à endtimes/endwhile qui gèrera l'itération
                break;
              }
            }
            break;
          }
        }
        continue;
      }

      // Skip si on est dans un bloc à ignorer
      if (skipUntil) {
        if (skipUntil === 'else_or_endif' && (action.type === 'else' || action.type === 'elseif' || action.type === 'endif')) {
          // Sera traité au prochain tour
        } else if (skipUntil === 'endif' && action.type === 'endif') {
          // Sera traité au prochain tour
        } else if (skipUntil === 'endwhile' && action.type === 'endwhile') {
          controlStack.pop();
          skipUntil = null;
        } else {
          i++;
          continue;
        }
      }

      // Exécuter l'action
      if (debugMode) {
        showStepIndicator(i + 1, totalSteps, `${action.type}: ${action.selector || action.value || ''}`);      }

      try {
        await executeAction(action, settings);
      } catch (error) {
        console.error(`[Plugin Rec Pro] Step ${i + 1} failed:`, error.message);

        if (debugMode) {
          showStepIndicator(i + 1, totalSteps, `ERROR: ${error.message}`, false, true);
        }

        chrome.runtime.sendMessage({
          type: 'rec:error',
          step: i + 1,
          action: action.type,
          error: error.message
        });

        if (!settings.continueOnError) {
          break;
        }
      }

      await sleep(settings.stepDelay);
      i++;
    }

    // Cleanup
    removeHighlight();
    removeTooltip();
    removeStepIndicator();

    chrome.runtime.sendMessage({ type: 'rec:playDone', stepsCompleted: currentStepIndex, totalSteps });
  }

  function evaluateCondition(condition) {
    if (!condition) return false;

    // Remplacer les variables
    let expr = replaceVariables(condition);

    // Évaluer l'expression
    try {
      // Support pour des comparaisons simples
      // Ex: ${count} > 5, ${name} == "John", ${visible}
      return !!eval(expr);
    } catch (e) {
      console.warn('[Plugin Rec Pro] Condition evaluation failed:', condition, e);
      return false;
    }
  }

  // ============== MESSAGE HANDLERS ==============

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'rec:start':
        recording = true;
        debugMode = msg.debug || false;
        attachHandlers();
        sendResponse({ ok: true });
        break;

      case 'rec:stop':
        recording = false;
        detachHandlers();
        sendResponse({ ok: true });
        break;

      case 'rec:play':
        debugMode = msg.debug || false;
        playActions(msg.actions).then(() => sendResponse({ ok: true }));
        return true;

      case 'rec:playMacro':
        debugMode = msg.debug || false;
        playActions(msg.actions || []).then(() => sendResponse({ ok: true }));
        return true;

      case 'rec:playStop':
        stopRequested = true;
        sendResponse({ ok: true });
        break;

      case 'rec:pause':
        pauseRequested = true;
        sendResponse({ ok: true });
        break;

      case 'rec:resume':
        pauseRequested = false;
        sendResponse({ ok: true });
        break;

      case 'rec:stepMode':
        debugMode = true;
        pauseRequested = true;
        sendResponse({ ok: true });
        break;

      case 'rec:nextStep':
        pauseRequested = false;
        setTimeout(() => { pauseRequested = true; }, 100);
        sendResponse({ ok: true });
        break;

      case 'rec:ping':
        sendResponse({ ok: true });
        break;

      case 'rec:cleared':
        runtimeVariables = {};
        break;

      case 'rec:setVariables':
        runtimeVariables = msg.variables || {};
        setVariables(runtimeVariables);
        sendResponse({ ok: true });
        break;

      case 'rec:getVariables':
        sendResponse({ ok: true, variables: runtimeVariables });
        break;

      case 'rec:highlight':
        (async () => {
          const el = await findElementWithRetry(msg.selector, 2000, msg.selectorType);
          if (el) {
            highlightElement(el, msg.type || 'default');
            if (msg.scroll !== false) {
              el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }
          sendResponse({ ok: !!el });
        })();
        return true;

      case 'rec:removeHighlight':
        removeHighlight();
        sendResponse({ ok: true });
        break;

      case 'rec:captureElement':
        // Mode capture pour sélectionner un élément visuellement
        enableElementCapture((info) => {
          chrome.runtime.sendMessage({ type: 'rec:elementCaptured', ...info });
        });
        sendResponse({ ok: true });
        break;
    }
  });

  // Mode capture d'élément
  let captureCallback = null;

  function enableElementCapture(callback) {
    captureCallback = callback;
    document.addEventListener('click', handleCaptureClick, true);
    document.addEventListener('mousemove', handleCaptureHover, true);
    document.body.style.cursor = 'crosshair';
  }

  function disableElementCapture() {
    captureCallback = null;
    document.removeEventListener('click', handleCaptureClick, true);
    document.removeEventListener('mousemove', handleCaptureHover, true);
    document.body.style.cursor = '';
    removeHighlight();
    removeTooltip();
  }

  function handleCaptureClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    if (!(el instanceof Element)) return;

    const info = getElementInfo(el);
    if (captureCallback) {
      captureCallback(info);
    }

    disableElementCapture();
  }

  function handleCaptureHover(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;

    highlightElement(el, 'recording');
    const info = getElementInfo(el);
    showTooltip(info.selector, e.clientX, e.clientY, 'recording');
  }

  // Init
  getActions().then(list => chrome.runtime.sendMessage({ type: 'rec:count', count: list.length }));
  console.log('[Plugin Rec Pro] Content script v2.0 loaded');

})();
