import { fmt } from './common.js';

export function initOverviewPage() {
  const rowsEl = document.querySelector('#rows');
  if (!rowsEl) return;

  fetch('./reports/index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((index) => {
      const fragment = document.createDocumentFragment();
      for (const item of index.categories) {
        const tr = document.createElement('tr');

        const tdCategory = document.createElement('td');
        const aCategory = document.createElement('a');
        aCategory.href = `./report.html?category=${encodeURIComponent(item.category)}`;
        aCategory.textContent = item.category;
        tdCategory.append(aCategory);

        const tdDomains = document.createElement('td');
        tdDomains.className = 'mono';
        tdDomains.textContent = fmt(item.final_domain_count);

        const tdSources = document.createElement('td');
        tdSources.className = 'mono';
        tdSources.textContent = fmt(item.source_count);

        const tdOutputs = document.createElement('td');
        const aHosts = document.createElement('a');
        aHosts.href = `./${encodeURIComponent(item.hosts_output)}`;
        aHosts.className = 'badge badge-cyan';
        aHosts.textContent = 'hosts';

        const aClash = document.createElement('a');
        aClash.href = `./${encodeURIComponent(item.clash_output)}`;
        aClash.className = 'badge badge-purple';
        aClash.textContent = 'clash';

        tdOutputs.append(aHosts, ' ', aClash);
        tr.append(tdCategory, tdDomains, tdSources, tdOutputs);
        fragment.append(tr);
      }
      rowsEl.replaceChildren(fragment);
    })
    .catch((err) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'error mono';
      td.textContent = `Unavailable: ${err.message}`;
      tr.append(td);
      rowsEl.replaceChildren(tr);
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOverviewPage);
} else {
  initOverviewPage();
}
