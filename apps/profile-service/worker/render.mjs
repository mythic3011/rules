function renderRule(rule) {
  if (rule.kind === "remote-classical") {
    return `ruleset=${rule.target},clash-classic:${rule.url},${rule.interval}`;
  }
  if (rule.kind === "remote-domain") {
    return `ruleset=${rule.target},clash-domain:${rule.url},${rule.interval}`;
  }
  if (rule.kind === "geosite") return `ruleset=${rule.target},[]GEOSITE,${rule.value}`;
  if (rule.kind === "geoip") {
    const suffix = rule.options?.length ? `,${rule.options.join(",")}` : "";
    return `ruleset=${rule.target},[]GEOIP,${rule.value}${suffix}`;
  }
  if (rule.kind === "final") return `ruleset=${rule.target},[]FINAL`;
  throw new Error(`Unsupported INI rule kind: ${rule.kind}`);
}

function renderCandidate(candidate) {
  return candidate.kind === "group-ref" ? `[]${candidate.value}` : candidate.value;
}

function renderGroup(group) {
  const candidates = (group.candidates ?? []).map(renderCandidate).join("`");
  if (group.type === "select-group") {
    return `custom_proxy_group=${group.name}\`select\`${candidates}`;
  }

  const prefix = `custom_proxy_group=${group.name}\`${group.kind}\``;
  if (group.kind === "select") {
    const fields = [];
    if (candidates) fields.push(candidates);
    if (group.filterPattern) fields.push(group.filterPattern);
    return prefix + fields.join("`");
  }
  if (group.kind === "url-test") {
    if (!group.filterPattern || !group.healthCheckUrl || group.interval == null || group.tolerance == null) {
      throw new Error(`Incomplete url-test group: ${group.name}`);
    }
    return `${prefix}${group.filterPattern}\`${group.healthCheckUrl}\`${group.interval},,${group.tolerance}`;
  }
  if (group.kind === "fallback") {
    if (!group.healthCheckUrl || group.interval == null || group.tolerance == null) {
      throw new Error(`Incomplete fallback group: ${group.name}`);
    }
    return `${prefix}${candidates}\`${group.healthCheckUrl}\`${group.interval},,${group.tolerance}`;
  }
  throw new Error(`Unsupported proxy-group kind: ${group.kind}`);
}

function banner(title, subtitle) {
  const bar = `;${"=".repeat(58)}`;
  const lines = [bar, `; ${title}`];
  if (subtitle) lines.push(`; ${subtitle}`);
  lines.push(bar, "");
  return lines;
}

function emitSection(lines, section) {
  if (section.type === "rules") {
    if (!section.rules.length && !section.emitIfEmpty) return;
    if (section.leadingBlank) lines.push("");
    lines.push(...section.comments, ...section.rules.map(renderRule));
    return;
  }
  if (section.type === "clusters") {
    if (section.leadingBlank) lines.push("");
    section.clusters.forEach((cluster, index) => {
      if ((index === 0 && section.blankBeforeFirst) || (index > 0 && section.blankBetween)) {
        lines.push("");
      }
      lines.push(...cluster.rules.map(renderRule));
    });
    return;
  }
  if (section.type === "groups") {
    lines.push("", "", ...banner(section.title, section.subtitle));
    section.groups.forEach((group, index) => {
      if (index && section.blankBetweenGroups) lines.push("");
      lines.push(renderGroup(group));
    });
    return;
  }
  if (section.type === "selectors") {
    lines.push("", "", ...banner(section.title, section.subtitle));
    section.selectors.forEach((selector, index) => {
      if (index && section.blankBetweenSelectors) lines.push("");
      lines.push(...selector.comments, renderGroup(selector.group));
    });
    return;
  }
  throw new Error(`Unsupported INI section type: ${section.type}`);
}

export function renderIni(plan, data) {
  const lines = [...data.render.preamble];
  for (const section of plan.sections) emitSection(lines, section);
  lines.push(...data.render.suffix);
  return `${lines.join("\n")}\n`;
}
