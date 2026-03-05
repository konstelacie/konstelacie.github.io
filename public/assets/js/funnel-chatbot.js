/**
 * Funnel chatbot – initializes PseudoChat widget on funnel pages.
 * Scrolls to CTA when user chooses booking/login path.
 */

import { PseudoChatWidget } from '/assets/js/pseudochat/index.js';
import { basePublicFlow } from '/assets/js/pseudochat/flows/basePublicFlow.js';
import { publicFlowConstellations } from '/assets/js/pseudochat/flows/publicFlowConstellations.js';

PseudoChatWidget.init({
  flow: 'publicConstellations',
  flowsRegistry: {
    basePublic: basePublicFlow,
    publicConstellations: publicFlowConstellations,
  },
  loginUrl: '/zona/prihlasenie/',
  storageNamespace: 'pseudochat',
  instanceId: 'funnel',
});

window.addEventListener('pseudochat:option_clicked', ({ detail }) => {
  if (
    detail.optionId === 'termin' ||
    detail.optionId === 'login' ||
    detail.nodeId === 'loginCta'
  ) {
    if (window.funnel?.cta?.scrollTo) {
      window.funnel.cta.scrollTo();
    }
  }
});
