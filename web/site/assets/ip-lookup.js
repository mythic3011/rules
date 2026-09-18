import { fmt, isIPv4, ipv4ToInt, parseCidrLine, cidrContains, buildSkippedReason } from './common.js';

export function initIpLookupPage() {
  const queryEl = document.getElementById('query');
  const runEl = document.getElementById('run');
  const summaryEl = document.getElementById('summary');
  const matchesEl = document.getElementById('matches');
  const skippedEl = document.getElementById('skipped');

  if (!queryEl || !runEl || !summaryEl || !matchesEl || !skippedEl) return;

  async function loadInventory() {
    const response = await fetch('./reports/rule-assets.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadCidrEntries(assetPath) {
    const response = await fetch(`./${assetPath}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map(parseCidrLine)
      .filter(Boolean);
  }

  function renderSummary(result) {
    const cards = [
      ['Query', result.query, 'Validated IPv4 input'],
      ['Matches', result.matches.length, 'Exact and CIDR hits'],
      ['Searched', result.searched_assets, 'CIDR-capable assets scanned'],
      ['Skipped', result.skipped_assets.length, 'Assets explicitly not searched'],
    ];
    summaryEl.replaceChildren(
      ...cards.map(([k, v, label]) => {
        const article = document.createElement('article');
        article.className = 'card-panel';

        const kicker = document.createElement('p');
        kicker.className = 'card-kicker';
        kicker.textContent = k;

        const val = document.createElement('p');
        val.className = `card-value ${k === 'Query' ? 'mono' : ''}`;
        val.textContent = typeof v === 'number' ? fmt(v) : String(v);

        const lbl = document.createElement('p');
        lbl.className = 'card-label';
        lbl.textContent = label;

        article.append(kicker, val, lbl);
        return article;
      })
    );
  }

  function renderMatches(matches) {
    if (!matches.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'mono';
      td.textContent = 'No matches.';
      tr.appendChild(td);
      matchesEl.replaceChildren(tr);
      return;
    }
    matchesEl.replaceChildren(
      ...matches.map((match) => {
        const tr = document.createElement('tr');

        const tdSource = document.createElement('td');
        tdSource.className = 'mono';
        tdSource.textContent = match.rule_source;

        const tdBy = document.createElement('td');
        tdBy.className = 'mono';
        tdBy.textContent = match.matched_by;

        const tdNet = document.createElement('td');
        tdNet.className = 'mono';
        tdNet.textContent = match.matched_network;

        const tdPrio = document.createElement('td');
        tdPrio.className = 'mono';
        tdPrio.textContent = String(match.priority);

        tr.append(tdSource, tdBy, tdNet, tdPrio);
        return tr;
      })
    );
  }

  function renderSkipped(skipped) {
    if (!skipped.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'mono';
      td.textContent = 'No skipped assets.';
      tr.appendChild(td);
      skippedEl.replaceChildren(tr);
      return;
    }
    skippedEl.replaceChildren(
      ...skipped.map((item) => {
        const tr = document.createElement('tr');

        const tdPath = document.createElement('td');
        tdPath.className = 'mono';
        tdPath.textContent = item.asset_path;

        const tdType = document.createElement('td');
        tdType.className = 'mono';
        tdType.textContent = item.asset_type;

        const tdReason = document.createElement('td');
        tdReason.className = 'mono';
        tdReason.textContent = item.reason;

        tr.append(tdPath, tdType, tdReason);
        return tr;
      })
    );
  }

  async function runLookup() {
    const query = queryEl.value.trim();
    if (!isIPv4(query)) {
      const card = document.createElement('article');
      card.className = 'card-panel';
      const kicker = document.createElement('p');
      kicker.className = 'card-kicker';
      kicker.textContent = 'Error';
      const val = document.createElement('p');
      val.className = 'card-value error';
      val.textContent = 'Invalid';
      const lbl = document.createElement('p');
      lbl.className = 'card-label';
      lbl.textContent = 'IPv4 input required for this beta.';
      card.append(kicker, val, lbl);
      summaryEl.replaceChildren(card);

      const trMatch = document.createElement('tr');
      const tdMatch = document.createElement('td');
      tdMatch.colSpan = 4;
      tdMatch.className = 'error mono';
      tdMatch.textContent = 'Only IPv4 is supported in this first CIDR-only beta.';
      trMatch.appendChild(tdMatch);
      matchesEl.replaceChildren(trMatch);

      const trSkip = document.createElement('tr');
      const tdSkip = document.createElement('td');
      tdSkip.colSpan = 3;
      tdSkip.className = 'mono';
      tdSkip.textContent = 'No lookup performed.';
      trSkip.appendChild(tdSkip);
      skippedEl.replaceChildren(trSkip);
      return;
    }

    const inventory = await loadInventory();
    const searchedAssets = inventory.assets.filter(
      (asset) => asset.searchable && asset.asset_class === 'cidr'
    );
    const skippedAssets = inventory.assets
      .filter((asset) => !(asset.searchable && asset.asset_class === 'cidr'))
      .map((asset) => ({
        asset_path: asset.path,
        asset_type: asset.asset_class,
        reason: buildSkippedReason(asset),
      }));

    const ipInt = ipv4ToInt(query);
    const matches = [];

    for (const asset of searchedAssets) {
      const cidrs = await loadCidrEntries(asset.path);
      for (const cidr of cidrs) {
        if (!cidrContains(ipInt, cidr)) continue;
        const exact = cidr.endsWith('/32');
        matches.push({
          asset_path: asset.path,
          asset_type: asset.asset_class,
          matched_by: exact ? 'exact_ip' : 'cidr_contains',
          matched_network: cidr,
          rule_source: asset.path.split('/').pop(),
          priority: exact ? 10 : 20,
        });
      }
    }

    matches.sort((a, b) => a.priority - b.priority || a.rule_source.localeCompare(b.rule_source));

    const result = {
      query,
      query_type: 'ip',
      match_mode: 'cidr_first',
      matches,
      searched_assets: searchedAssets.length,
      skipped_assets: skippedAssets,
    };

    renderSummary(result);
    renderMatches(result.matches);
    renderSkipped(result.skipped_assets);
  }

  runEl.addEventListener('click', () => {
    runLookup().catch((error) => {
      const card = document.createElement('article');
      card.className = 'card-panel';
      const kicker = document.createElement('p');
      kicker.className = 'card-kicker';
      kicker.textContent = 'Error';
      const val = document.createElement('p');
      val.className = 'card-value error';
      val.textContent = 'Failed';
      const lbl = document.createElement('p');
      lbl.className = 'card-label';
      lbl.textContent = error.message;
      card.append(kicker, val, lbl);
      summaryEl.replaceChildren(card);

      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'error mono';
      td.textContent = error.message;
      tr.appendChild(td);
      matchesEl.replaceChildren(tr);
    });
  });

  queryEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runEl.click();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIpLookupPage);
} else {
  initIpLookupPage();
}
