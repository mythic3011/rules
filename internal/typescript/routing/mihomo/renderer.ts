import YAML from "yaml";

import type { MihomoFragmentIR } from "./types.js";

export function renderMihomoFragment(ir: MihomoFragmentIR): string {
  const document = new YAML.Document({ "proxy-groups": ir.groups.map((group) => group.type === "select" ? { name: group.name, type: group.type, "empty-fallback": group.emptyFallback, proxies: group.proxies, ...(group.use === undefined ? {} : { use: group.use, filter: group.filter }) } : { name: group.name, type: group.type, "empty-fallback": group.emptyFallback, use: group.use, filter: group.filter, url: group.url, interval: group.interval, tolerance: group.tolerance }), "rule-providers": ir.ruleProviders, dns: { "respect-rules": ir.dns.respectRules, "default-nameserver": ir.dns.defaultNameserver, "proxy-server-nameserver": ir.dns.proxyServerNameserver, nameserver: ir.dns.nameserver, "nameserver-policy": ir.dns.nameserverPolicy }, rules: ir.rules });
  document.commentBefore = `NON-STANDALONE AI ROUTING FRAGMENT\nPROVENANCE: ${ir.metadata.provenance}\nEXTERNAL PROXY PROVIDERS: ${ir.metadata.externalProxyProviders.join(", ")}\nGlobal MATCH remains owned by the Python generator.`;
  return document.toString();
}
