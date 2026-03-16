# PseudoChat Widget

Configurable decision-tree chat widget for the public site. Looks like a chat (bubbles, typing, quick replies) but uses deterministic flow logic—no AI or backend required. Funnels users into the client zone login when they need real chat.

## Deployment status: parked for later use

**The PseudoChat widget is not used on any live funnel at this time.** It is implemented and ready, but intentionally parked. The first-visit funnel keeps a single CTA (reservation) to reduce decision friction. **Chatbot may be introduced on remarketing funnels** when we want to offer softer next steps (e.g. "Ask a question") to users who have already seen the offer. Until then, the codebase keeps `funnel-chatbot.js`, flows, and styles available for future remarketing pages.

## Overview

- **Static-site safe** – No server calls, no vendor widgets
- **Data-driven** – Flows defined as JSON-like config, not hardcoded
- **Inheritance** – Derived flows extend base flows (override nodes, add options, extend arrays)
- **Embeddable** – Single `init()` call, works from any page
- **Extensible** – Flow engine is pure logic; UI pieces could be reused for real chat in client zone

## Architecture

```
PseudoChatWidget (public API)
    ├── FlowEngine     – resolves next node, visibleIf, actions (pure logic)
    ├── FlowMerger     – merges base + derived flows
    └── StorageAdapter – namespaced localStorage
```

| Module | Responsibility |
|--------|----------------|
| `FlowEngine` | State machine: get node, resolve next, run action, evaluate `visibleIf` |
| `FlowMerger` | Deep merge with inheritance: arrays replace by default, `extend: true` to append |
| `StorageAdapter` | Namespaced keys (e.g. `pseudochat_default_state`, `pseudochat_default_draft_question`) |
| `PseudoChatWidget` | DOM (launcher, panel, bubbles, options, input), events, init API |

## File Structure

```
public/assets/
├── css/pseudochat.css
└── js/pseudochat/
    ├── index.js           # PseudoChatWidget entrypoint
    ├── FlowEngine.js
    ├── FlowMerger.js
    ├── StorageAdapter.js
    └── flows/
        ├── basePublicFlow.js
        └── publicFlowConstellations.js
```

## API

### `PseudoChatWidget.init(opts)`

| Option | Default | Description |
|--------|---------|-------------|
| `mountSelector` | `'body'` | DOM element to append launcher and panel |
| `flow` | — | Flow id (string) or flow config object |
| `flowsRegistry` | `{}` | `{ flowId: flowConfig }` to register before init |
| `loginUrl` | `'/zona/prihlasenie/'` | URL for OPEN_LOGIN action |
| `storageNamespace` | `'pseudochat'` | Prefix for localStorage keys |
| `instanceId` | `'default'` | Suffix for multiple widgets on one page |

### `PseudoChatWidget.registerFlow(flowId, flowConfig)`

Register a flow by id. Used before `init` or passed via `flowsRegistry`.

### `PseudoChatWidget.useFlow(flowId)`

Returns the merged flow config (for debugging or inspection).

### `PseudoChatWidget.getDraftQuestion(fullNamespace?)`

Reads the draft question stored by input nodes. Use in client zone to prefill real chat.

- Default `fullNamespace`: `'pseudochat_default'` (matches default `storageNamespace` + `instanceId`).
- Returns `null` if none stored.

### `PseudoChatWidget.reset(instanceId?)`

Clears conversation state and restarts from welcome. Default `instanceId`: `'default'`.

## Flow Config Schema

```javascript
{
  flowId: string,
  version: string,
  extends?: string,        // Parent flow id for inheritance
  startNodeId: string,
  theme: {
    assistantName: string,
    assistantAvatarUrl?: string,
    accentColor?: string
  },
  nodes: {
    [nodeId]: {
      type: 'message' | 'menu' | 'input' | 'action',
      messages: string[],   // Sequential; sent with typing delay (300–900ms)
      options?: Array<{
        id: string,
        label: string,
        next: string,
        action?: 'OPEN_LOGIN' | 'OPEN_URL' | 'STORE_LOCAL' | 'RESET' | 'EMIT_EVENT',
        actionPayload?: object,
        visibleIf?: object,
        disable?: boolean   // Derived: hide this option
      }>,
      input?: {
        placeholder: string,
        minLen?: number,
        maxLen?: number,
        storeKey: string,
        submitLabel: string,
        onSubmitNext: string
      },
      guards?: { requiresLogin?: boolean }
    }
  }
}
```

### Node Types

| Type | Purpose |
|------|---------|
| `message` | Assistant message + option buttons |
| `menu` | Same as message (alias) |
| `input` | Prompt + text input; stores value under `storeKey`, goes to `onSubmitNext` |
| `action` | Message + options; some options trigger actions (e.g. OPEN_LOGIN) |

### Actions

| Action | Use |
|--------|-----|
| `OPEN_LOGIN` | Opens `loginUrl` from init config (new tab) |
| `OPEN_URL` | Opens `actionPayload.url` |
| `STORE_LOCAL` | Store `userPayload.value` at `actionPayload.key` |
| `RESET` | Clear conversation state |
| `EMIT_EVENT` | Dispatch `pseudochat:custom` with `actionPayload` |

### Inheritance (FlowMerger)

- **Objects** – Deep merge
- **Arrays** – Replace by default. To append: `[{ extend: true, items: [...] }]`
- **Options** – `disable: true` in derived flow removes base option
- **Nodes** – Derived can override (merge) or add new nodes
- **startNodeId** – Derived overrides base

## Events

All events include `detail.flowId`.

| Event | Detail |
|-------|--------|
| `pseudochat:open` | Panel opened |
| `pseudochat:close` | Panel closed |
| `pseudochat:option_clicked` | `{ nodeId, optionId }` |
| `pseudochat:login_clicked` | `{ nodeId, optionId }` |
| `pseudochat:message_sent` | `{ nodeId, payload: { text } }` |
| `pseudochat:reset` | Conversation reset |
| `pseudochat:custom` | From EMIT_EVENT action |

## visibleIf Predicates

Options can have `visibleIf: { key: value }` or `{ key: [val1, val2] }` (membership).

Context = stored `context` object + runtime:

- `isMobile` – boolean
- `pagePath` – `location.pathname`

Store context via `storage.set('context', { ... })` (not used by default flows).

## Integration

### Basic

```html
<link rel="stylesheet" href="/assets/css/pseudochat.css">
<script type="module">
  import { PseudoChatWidget } from '/assets/js/pseudochat/index.js';
  import { basePublicFlow } from '/assets/js/pseudochat/flows/basePublicFlow.js';
  import { publicFlowConstellations } from '/assets/js/pseudochat/flows/publicFlowConstellations.js';

  PseudoChatWidget.registerFlow('basePublic', basePublicFlow);
  PseudoChatWidget.registerFlow('publicConstellations', publicFlowConstellations);

  PseudoChatWidget.init({
    flow: 'publicConstellations',
    loginUrl: '/zona/prihlasenie/',
  });
</script>
```

### With flowsRegistry

```javascript
PseudoChatWidget.init({
  flow: 'publicConstellations',
  flowsRegistry: {
    basePublic: basePublicFlow,
    publicConstellations: publicFlowConstellations,
  },
  loginUrl: '/zona/prihlasenie/',
});
```

### Client Zone – Prefill Draft Question

On the client zone chat page, after user returns from login:

```javascript
import { PseudoChatWidget } from '/assets/js/pseudochat/index.js';

const draft = PseudoChatWidget.getDraftQuestion('pseudochat_default');
if (draft) {
  document.querySelector('#chat-input').value = draft;
  // Optional: clear after use
  localStorage.removeItem('pseudochat_default_draft_question');
}
```

Use the same `storageNamespace` + `instanceId` as in `init` (default: `pseudochat_default`).

## Adding a New Flow

1. Create `public/assets/js/pseudochat/flows/myFlow.js`:
   ```javascript
   export const myFlow = {
     flowId: 'myFlow',
     version: '1.0',
     extends: 'basePublic',
     startNodeId: 'welcome',
     nodes: {
       welcome: { messages: ['Custom welcome…'] },
       // override or add nodes
     },
   };
   ```
2. Register and init:
   ```javascript
   PseudoChatWidget.registerFlow('myFlow', myFlow);
   PseudoChatWidget.init({ flow: 'myFlow', ... });
   ```

## Edge Cases

- Missing `next` or invalid `nodeId` → fallback node (or welcome)
- Missing node in flow → fallback
- `runAction` errors are caught and logged
