/**
 * FlowMerger – merges base and derived flows with inheritance rules.
 * Arrays replace by default; use { extend: true, items: [...] } to append.
 */

function deepMerge(target, source) {
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object') return source;
  if (Array.isArray(source)) return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (Array.isArray(srcVal)) {
      if (srcVal.length && srcVal[0]?.extend === true) {
        const baseArr = result[key] || [];
        result[key] = [...baseArr, ...(srcVal[0].items || [])];
      } else {
        result[key] = [...srcVal];
      }
    } else if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
      result[key] = deepMerge(result[key] || {}, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

function mergeNode(baseNode, override) {
  if (!override) return baseNode;
  const base = baseNode ? { ...baseNode } : {};
  const merged = deepMerge(base, override);
  if (merged.options) {
    merged.options = merged.options.filter((o) => !o.disable);
  }
  return merged;
}

export function mergeFlow(baseFlow, derivedFlow) {
  const merged = { ...baseFlow, ...derivedFlow };
  merged.nodes = { ...baseFlow.nodes };
  for (const [id, node] of Object.entries(derivedFlow.nodes || {})) {
    merged.nodes[id] = mergeNode(baseFlow.nodes[id], node);
  }
  return merged;
}
