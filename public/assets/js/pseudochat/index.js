/**
 * PseudoChatWidget – public API and DOM orchestration.
 */

import { createStorageAdapter, DRAFT_QUESTION_KEY } from './StorageAdapter.js';
import { mergeFlow } from './FlowMerger.js';
import { createFlowEngine } from './FlowEngine.js';

const TYPING_DELAY_MIN = 300;
const TYPING_DELAY_MAX = 900;

function randomDelay() {
  return TYPING_DELAY_MIN + Math.random() * (TYPING_DELAY_MAX - TYPING_DELAY_MIN);
}

export const PseudoChatWidget = {
  instances: new Map(),
  flowsRegistry: new Map(),

  registerFlow(flowId, flowConfig) {
    this.flowsRegistry.set(flowId, flowConfig);
  },

  getMergedFlow(flowIdOrConfig) {
    if (typeof flowIdOrConfig === 'object') return flowIdOrConfig;
    let flow = this.flowsRegistry.get(flowIdOrConfig);
    if (!flow) return null;
    while (flow.extends) {
      const base = this.flowsRegistry.get(flow.extends);
      if (!base) break;
      flow = mergeFlow(base, flow);
    }
    return flow;
  },

  init(opts = {}) {
    const {
      mountSelector = 'body',
      flow: flowIdOrConfig,
      flowsRegistry = {},
      loginUrl = '/zona/prihlasenie/',
      storageNamespace = 'pseudochat',
      instanceId = 'default',
    } = opts;

    Object.entries(flowsRegistry).forEach(([id, cfg]) => this.registerFlow(id, cfg));

    const mergedFlow = this.getMergedFlow(flowIdOrConfig);
    if (!mergedFlow) throw new Error('PseudoChatWidget: invalid flow');

    const fullNamespace = storageNamespace + '_' + instanceId;
    const storage = createStorageAdapter(fullNamespace);
    const engine = createFlowEngine(mergedFlow, storage);

    let state = storage.get('state') || { nodeId: engine.getStartNodeId() };
    const saveState = () => storage.set('state', state);

    const container = document.querySelector(mountSelector) || document.body;
    const widgetId = `pseudochat-${instanceId}`;

    const launcher = document.createElement('button');
    launcher.id = `${widgetId}-launcher`;
    launcher.className = 'pseudochat-launcher';
    launcher.setAttribute('aria-label', 'Otvoriť chat');
    launcher.innerHTML = '💬';
    container.appendChild(launcher);

    const panel = document.createElement('div');
    panel.id = `${widgetId}-panel`;
    panel.className = 'pseudochat-panel pseudochat-panel--closed';
    panel.innerHTML = `
      <div class="pseudochat-header">
        <span class="pseudochat-assistant-name">${mergedFlow.theme?.assistantName || 'Asistent'}</span>
        <button class="pseudochat-reset" aria-label="Resetovať">↺</button>
      </div>
      <div class="pseudochat-messages"></div>
      <div class="pseudochat-options"></div>
      <div class="pseudochat-input-area" style="display:none">
        <input type="text" class="pseudochat-input" placeholder="">
        <button type="button" class="pseudochat-submit">Odoslať</button>
      </div>
    `;
    container.appendChild(panel);

    const messagesEl = panel.querySelector('.pseudochat-messages');
    const optionsEl = panel.querySelector('.pseudochat-options');
    const inputArea = panel.querySelector('.pseudochat-input-area');
    const inputEl = panel.querySelector('.pseudochat-input');
    const submitBtn = panel.querySelector('.pseudochat-submit');

    function emit(eventName, detail = {}) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { flowId: mergedFlow.flowId, ...detail },
        })
      );
    }

    function appendMessage(role, text) {
      const bubble = document.createElement('div');
      bubble.className = `pseudochat-bubble pseudochat-bubble--${role}`;
      const span = document.createElement('span');
      span.textContent = text;
      bubble.appendChild(span);
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTypingThen(callback) {
      const typing = document.createElement('div');
      typing.className = 'pseudochat-bubble pseudochat-bubble--assistant pseudochat-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      setTimeout(() => {
        typing.remove();
        callback();
      }, randomDelay());
    }

    function renderOptions(node, currentNodeId) {
      optionsEl.innerHTML = '';
      if (!node.options) return;
      node.options.forEach((opt) => {
        if (!engine.isOptionVisible(node, opt)) return;
        const btn = document.createElement('button');
        btn.className = 'pseudochat-option';
        btn.textContent = opt.label;
        btn.onclick = () => handleOptionClick(opt, currentNodeId);
        optionsEl.appendChild(btn);
      });
      optionsEl.style.display = 'block';
    }

    function handleOptionClick(opt, nodeId) {
      appendMessage('user', opt.label);
      emit('pseudochat:option_clicked', { nodeId, optionId: opt.id });

      if (opt.action === 'OPEN_LOGIN') {
        emit('pseudochat:login_clicked', { nodeId, optionId: opt.id });
        engine.runAction(opt, { loginUrl });
      } else if (opt.action === 'RESET') {
        engine.runAction(opt);
        emit('pseudochat:reset');
        doReset();
        return;
      }

      const next = engine.resolveNext(nodeId, opt.id);
      const nextId = next?.nodeId ?? engine.getFallbackNodeId();
      state.nodeId = nextId;
      saveState();
      renderNode(nextId);
    }

    function renderInput(node, currentNodeId) {
      const inp = node.input;
      if (!inp) return;
      inputArea.style.display = 'flex';
      inputEl.placeholder = inp.placeholder || 'Napíšte…';
      submitBtn.textContent = inp.submitLabel || 'Odoslať';
      inputEl.value = '';
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') submitBtn.click();
      };
      submitBtn.onclick = () => {
        const val = inputEl.value.trim();
        const min = inp.minLen || 0;
        const max = inp.maxLen ?? 500;
        if (val.length < min || val.length > max) return;
        if (inp.storeKey) storage.set(inp.storeKey, val);
        appendMessage('user', val);
        emit('pseudochat:message_sent', { nodeId: currentNodeId, payload: { text: val } });
        inputArea.style.display = 'none';
        state.nodeId = inp.onSubmitNext;
        saveState();
        renderNode(inp.onSubmitNext);
      };
    }

    function renderNode(nodeId) {
      const node = engine.getNode(nodeId);
      const fallbackId = engine.getFallbackNodeId();
      const target = node || engine.getNode(fallbackId);
      const targetId = node ? nodeId : fallbackId;

      optionsEl.style.display = 'none';
      inputArea.style.display = 'none';

      if (!target) return;

      const msgs = target.messages || [];
      let i = 0;

      function showNextMessage() {
        if (i >= msgs.length) {
          renderOptions(target, targetId);
          if (target.input) renderInput(target, targetId);
          return;
        }
        showTypingThen(() => {
          appendMessage('assistant', msgs[i]);
          i++;
          showNextMessage();
        });
      }
      showNextMessage();
    }

    function doReset() {
      storage.clear();
      state = { nodeId: engine.getStartNodeId() };
      saveState();
      messagesEl.innerHTML = '';
      optionsEl.innerHTML = '';
      inputArea.style.display = 'none';
      renderNode(state.nodeId);
    }

    launcher.onclick = () => {
      panel.classList.toggle('pseudochat-panel--closed');
      if (panel.classList.contains('pseudochat-panel--closed')) {
        emit('pseudochat:close');
      } else {
        emit('pseudochat:open');
      }
    };

    panel.querySelector('.pseudochat-reset').onclick = () => {
      emit('pseudochat:reset');
      doReset();
    };

    this.instances.set(instanceId, {
      engine,
      storage,
      mergedFlow,
      reset: doReset,
    });

    renderNode(state.nodeId);
  },

  useFlow(flowId) {
    return this.getMergedFlow(flowId);
  },

  getDraftQuestion(fullNamespace = 'pseudochat_default') {
    try {
      const raw = localStorage.getItem(`${fullNamespace}_${DRAFT_QUESTION_KEY}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  reset(instanceId = 'default') {
    const inst = this.instances.get(instanceId);
    if (inst) inst.reset();
  },
};
