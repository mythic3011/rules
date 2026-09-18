import { fmt, safeUrl } from './common.js';

export function initReportPage() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');

  const titleEl = document.getElementById('title');
  const leadEl = document.getElementById('lead');
  const statsEl = document.getElementById('stats');
  const metadataEl = document.getElementById('metadata');
  const sourcesEl = document.getElementById('sources');

  if (!titleEl || !leadEl || !statsEl || !metadataEl || !sourcesEl) return;

  function fail(message) {
    titleEl.textContent = 'Report unavailable';

    const errorSpan = document.createElement('span');
    errorSpan.className = 'error';
    errorSpan.textContent = message;
    leadEl.replaceChildren(errorSpan);

    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'error mono';
    td.textContent = message;
    tr.appendChild(td);
    sourcesEl.replaceChildren(tr);
  }

  if (!category) {
    fail('Missing category query parameter.');
    return;
  }

  fetch(`./reports/${encodeURIComponent(category)}.summary.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((summary) => {
      titleEl.textContent = summary.category;
      leadEl.textContent = `Generated at ${summary.generated_at}. This view shows source provenance, final category size, and the exact output files produced for this block family.`;

      const cards = [
        ['Final DNS', summary.final_domain_count, 'Domains in dnsmasq / hosts output'],
        ['Clash Lite', summary.clash_domain_count, 'Domains in lite Clash payload'],
        ['Upstreams', summary.sources.length, 'Active source inputs'],
        ['Local Blocklist', summary.local_blocklist_count, 'Domains added locally'],
      ];
      statsEl.replaceChildren(
        ...cards.map(([k, v, label]) => {
          const article = document.createElement('article');
          article.className = 'card-panel';

          const kicker = document.createElement('p');
          kicker.className = 'card-kicker';
          kicker.textContent = k;

          const val = document.createElement('p');
          val.className = 'card-value';
          val.textContent = fmt(v);

          const lbl = document.createElement('p');
          lbl.className = 'card-label';
          lbl.textContent = label;

          article.append(kicker, val, lbl);
          return article;
        })
      );

      const meta = [
        ['Generated At', summary.generated_at],
        ['Source Config', summary.source_config],
        ['Custom Source Config', summary.custom_source_config],
        ['Allowlist', summary.allowlist],
        ['Blocklist', summary.blocklist],
        ['DNSMasq Output', summary.dnsmasq_output],
        ['Hosts Output', summary.hosts_output],
        ['Clash Output', summary.clash_output],
        ['Merged Pre-Allowlist', fmt(summary.merged_pre_allowlist_count)],
        ['Post-Allowlist', fmt(summary.post_allowlist_count)],
        ['Upstream Unique', fmt(summary.upstream_unique_count)],
      ];
      metadataEl.replaceChildren(
        ...meta.map(([k, v]) => {
          const item = document.createElement('div');
          item.className = 'meta-item';

          const strong = document.createElement('strong');
          strong.textContent = k;

          const mono = document.createElement('div');
          mono.className = 'mono';
          mono.textContent = String(v);

          item.append(strong, mono);
          return item;
        })
      );

      if (!summary.sources || !summary.sources.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'error mono';
        td.textContent = 'No active upstream sources for this category.';
        tr.appendChild(td);
        sourcesEl.replaceChildren(tr);
        return;
      }

      sourcesEl.replaceChildren(
        ...summary.sources.map((source) => {
          const tr = document.createElement('tr');

          const tdId = document.createElement('td');
          tdId.className = 'mono';
          tdId.textContent = source.id;

          const tdCount = document.createElement('td');
          tdCount.className = 'mono';
          tdCount.textContent = fmt(source.count);

          const tdFormat = document.createElement('td');
          tdFormat.className = 'mono';
          tdFormat.textContent = source.format;

          const tdUrl = document.createElement('td');
          tdUrl.className = 'mono';
          const rawUrl = source.homepage || source.url;
          const href = safeUrl(rawUrl);
          if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.textContent = href;
            tdUrl.appendChild(link);
          } else {
            tdUrl.textContent = String(rawUrl ?? '');
          }

          tr.append(tdId, tdCount, tdFormat, tdUrl);
          return tr;
        })
      );
    })
    .catch((error) => fail(`Failed to load category report: ${error.message}`));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportPage);
} else {
  initReportPage();
}
