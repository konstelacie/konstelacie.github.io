/**
 * FlowEngine – pure flow logic. Resolves next node, evaluates visibleIf, runs actions.
 * No DOM dependency.
 */

function getRuntimeContext() {
  if (typeof navigator === 'undefined' || typeof location === 'undefined') {
    return { isMobile: false, pagePath: '' };
  }
  return {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ),
    pagePath: location.pathname,
  };
}

function evalVisibleIf(visibleIf, storage, runtime) {
  if (!visibleIf || typeof visibleIf !== 'object') return true;
  const ctx = { ...(storage.get('context') || {}), ...runtime };
  for (const [key, value] of Object.entries(visibleIf)) {
    const ctxVal = ctx[key];
    if (Array.isArray(value)) {
      if (!value.includes(ctxVal)) return false;
    } else if (ctxVal !== value) {
      return false;
    }
  }
  return true;
}

/**
 * @param {object} flowConfig – merged flow config
 * @param {object} storage – StorageAdapter instance
 */
export function createFlowEngine(flowConfig, storage) {
  const nodes = flowConfig.nodes || {};
  const fallbackId = 'fallback';
  const welcomeId = 'welcome';

  function getFallbackNode() {
    return nodes[fallbackId] || nodes[welcomeId] || null;
  }

  function getFallbackResult() {
    const node = getFallbackNode();
    return node ? { nodeId: fallbackId in nodes ? fallbackId : welcomeId, node } : null;
  }

  return {
    getStartNodeId() {
      return flowConfig.startNodeId || welcomeId;
    },

    getNode(nodeId) {
      return nodes[nodeId] || null;
    },

    getFallbackNode() {
      return getFallbackNode();
    },

    getFallbackNodeId() {
      return fallbackId in nodes ? fallbackId : welcomeId;
    },

    resolveOption(node, optionId) {
      if (!node?.options) return null;
      const opt = node.options.find((o) => o.id === optionId);
      if (!opt || opt.disable) return null;
      const runtime = getRuntimeContext();
      if (!evalVisibleIf(opt.visibleIf, storage, runtime)) return null;
      return opt;
    },

    resolveNext(nodeId, optionId) {
      const node = this.getNode(nodeId);
      if (!node) return getFallbackResult();

      const opt = this.resolveOption(node, optionId);
      if (!opt) return getFallbackResult();

      const nextId = opt.next;
      if (!nextId) return getFallbackResult();

      const nextNode = this.getNode(nextId);
      if (!nextNode) return getFallbackResult();

      return { nodeId: nextId, node: nextNode };
    },

    isOptionVisible(node, option) {
      if (option.disable) return false;
      const runtime = getRuntimeContext();
      return evalVisibleIf(option.visibleIf, storage, runtime);
    },

    /**
     * Execute action for an option. Widget passes loginUrl and userPayload.
     * @param {object} option – option with action and actionPayload
     * @param {object} config – { loginUrl }
     * @param {object} userPayload – { value } for STORE_LOCAL
     */
    runAction(option, config = {}, userPayload = {}) {
      const action = option?.action;
      if (!action) return;

      try {
        switch (action) {
          case 'OPEN_LOGIN':
            if (config.loginUrl && typeof window !== 'undefined') {
              window.open(config.loginUrl, '_blank');
            }
            break;
          case 'OPEN_URL':
            if (option.actionPayload?.url && typeof window !== 'undefined') {
              window.open(option.actionPayload.url, '_blank');
            }
            break;
          case 'STORE_LOCAL':
            if (option.actionPayload?.key && userPayload.value !== undefined) {
              storage.set(option.actionPayload.key, userPayload.value);
            }
            break;
          case 'RESET':
            storage.clear();
            break;
          case 'EMIT_EVENT':
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('pseudochat:custom', {
                  detail: { ...option.actionPayload },
                })
              );
            }
            break;
        }
      } catch (e) {
        console.warn('PseudoChat runAction failed:', action, e);
      }
    },
  };
}
