'use strict';
'require view';
'require rpc';
'require ui';

var callTrace = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'trace',
	params: [ 'service' ],
	expect: { '': {} }
});

var callRegions = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getRegions',
	expect: { '': {} }
});

var callHistory = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getHistory',
	expect: { '': {} }
});

var callClearHistory = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'clearHistory',
	expect: { '': {} }
});

var services = [
	{ id: 'chatgpt', label: 'ChatGPT', endpoint: 'chatgpt.com/cdn-cgi/trace' },
	{ id: 'claude', label: 'Claude', endpoint: 'claude.ai/cdn-cgi/trace' },
	{ id: 'grok', label: 'Grok', endpoint: 'grok.com/cdn-cgi/trace' }
];

function regionMap(catalog) {
	var map = {};
	var regions = catalog && Array.isArray(catalog.regions) ? catalog.regions : [];
	regions.forEach(function(region) {
		map[region.id] = region;
	});
	return map;
}

function regionMatch(result, regions) {
	if (!result || !result.ok || !result.expectedRegion || !result.country)
		return 'unknown';
	var region = regions[result.expectedRegion];
	if (!region || !Array.isArray(region.countryCodes) || region.countryCodes.length === 0)
		return 'unknown';
	return region.countryCodes.indexOf(result.country) >= 0 ? 'match' : 'mismatch';
}

function expectedText(result, regions) {
	if (!result || !result.expectedMode)
		return '-';
	var text = result.expectedMode === 'direct' ? _('Direct') : result.expectedMode === 'proxy' ? _('Proxy') : result.expectedMode;
	if (result.expectedRegion) {
		var region = regions[result.expectedRegion];
		text += ' · ' + (region && region.name ? region.name : result.expectedRegion.toUpperCase());
	}
	return text;
}

function formatTime(epoch) {
	if (!epoch)
		return '-';
	try {
		return new Date(epoch * 1000).toLocaleString();
	}
	catch (e) {
		return '-';
	}
}

function latestFor(records, service) {
	for (var i = 0; i < records.length; i++) {
		if (records[i].service === service)
			return records[i];
	}
	return null;
}

function setText(node, value) {
	node.textContent = value || '-';
}

function setBadge(node, kind, text) {
	node.className = 'ocg-test-badge ocg-test-' + kind;
	node.textContent = text;
}

function renderResult(nodes, result, regions, epoch) {
	if (!result || !result.ok) {
		setBadge(nodes.badge, 'bad', _('Failed'));
		setText(nodes.ip, '-');
		setText(nodes.location, '-');
		setText(nodes.protocol, '-');
		setText(nodes.expected, expectedText(result, regions));
		setText(nodes.match, result && result.error ? result.error : _('Probe failed'));
		setText(nodes.last, epoch ? _('Last tested') + ': ' + formatTime(epoch) : _('Last test failed'));
		nodes.match.className = 'ocg-test-value ocg-test-bad-text';
		return;
	}

	var match = regionMatch(result, regions);
	setBadge(nodes.badge, match === 'match' ? 'ok' : match === 'mismatch' ? 'bad' : 'warn', match === 'match' ? _('Match') : match === 'mismatch' ? _('Mismatch') : _('Observed'));
	setText(nodes.ip, result.ip);
	setText(nodes.location, [ result.country || '-', result.colo || '-' ].join(' · '));
	setText(nodes.protocol, [ result.http || '-', result.tls || '-' ].join(' · '));
	setText(nodes.expected, expectedText(result, regions));
	setText(nodes.match, match === 'match' ? _('Observed country matches the configured route region.') : match === 'mismatch' ? _('Observed country does not match the configured route region.') : _('No comparable region expectation is available.'));
	setText(nodes.last, _('Last tested') + ': ' + formatTime(epoch || Math.floor(Date.now() / 1000)));
	nodes.match.className = 'ocg-test-value ' + (match === 'match' ? 'ocg-test-ok-text' : match === 'mismatch' ? 'ocg-test-bad-text' : 'ocg-test-muted');
}

function buildServiceCard(service) {
	var nodes = {
		badge: E('span', { 'class': 'ocg-test-badge ocg-test-idle' }, _('Not tested')),
		ip: E('span', { 'class': 'ocg-test-value' }, '-'),
		location: E('span', { 'class': 'ocg-test-value' }, '-'),
		protocol: E('span', { 'class': 'ocg-test-value' }, '-'),
		expected: E('span', { 'class': 'ocg-test-value' }, '-'),
		match: E('span', { 'class': 'ocg-test-value ocg-test-muted' }, _('Run the probe to compare observed egress with routing intent.')),
		last: E('span', { 'class': 'ocg-test-last' }, _('No history'))
	};
	var button = E('button', { 'class': 'btn cbi-button cbi-button-action' }, _('Run test'));
	var card = E('div', { 'class': 'ocg-test-card' }, [
		E('div', { 'class': 'ocg-test-head' }, [
			E('div', {}, [
				E('div', { 'class': 'ocg-test-name' }, service.label),
				E('div', { 'class': 'ocg-test-endpoint' }, service.endpoint)
			]),
			nodes.badge
		]),
		E('div', { 'class': 'ocg-test-grid' }, [
			E('div', {}, [E('div', { 'class': 'ocg-test-label' }, _('Public IP')), nodes.ip]),
			E('div', {}, [E('div', { 'class': 'ocg-test-label' }, _('Country / edge')), nodes.location]),
			E('div', {}, [E('div', { 'class': 'ocg-test-label' }, _('HTTP / TLS')), nodes.protocol]),
			E('div', {}, [E('div', { 'class': 'ocg-test-label' }, _('Expected route')), nodes.expected])
		]),
		E('div', { 'class': 'ocg-test-match' }, [
			E('div', { 'class': 'ocg-test-label' }, _('Assessment')),
			nodes.match
		]),
		E('div', { 'class': 'ocg-test-footer' }, [nodes.last, button])
	]);

	return { card: card, button: button, nodes: nodes };
}

function historyStatus(record, regions) {
	if (!record.ok)
		return { text: _('Failed'), klass: 'ocg-test-bad' };
	var match = regionMatch(record, regions);
	if (match === 'match')
		return { text: _('Match'), klass: 'ocg-test-ok' };
	if (match === 'mismatch')
		return { text: _('Mismatch'), klass: 'ocg-test-bad' };
	return { text: _('Observed'), klass: 'ocg-test-warn' };
}

function historyTable(records, regions) {
	if (!records.length)
		return E('div', { 'class': 'ocg-test-empty' }, _('No probe history yet.'));
	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', {}, _('Time')),
			E('th', {}, _('Service')),
			E('th', {}, _('Observed')),
			E('th', {}, _('Expected')),
			E('th', {}, _('Result'))
		])
	].concat(records.slice(0, 12).map(function(record) {
		var status = historyStatus(record, regions);
		var observed = record.ok ? [ record.country || '-', record.colo || '-', record.ip || '-' ].join(' · ') : (record.error || _('Probe failed'));
		return E('tr', {}, [
			E('td', {}, formatTime(record.epoch)),
			E('td', {}, record.service || '-'),
			E('td', {}, observed),
			E('td', {}, expectedText(record, regions)),
			E('td', {}, E('span', { 'class': 'ocg-test-badge ' + status.klass }, status.text))
		]);
	})));
}

return view.extend({
	load: function() {
		return Promise.all([ callRegions(), callHistory() ]);
	},

	render: function(data) {
		var regions = regionMap(data[0] || {});
		var records = data[1] && Array.isArray(data[1].records) ? data[1].records : [];
		var cards = {};

		function run(service) {
			var item = cards[service.id];
			setBadge(item.nodes.badge, 'running', _('Testing…'));
			item.button.disabled = true;
			return callTrace(service.id).then(function(result) {
				renderResult(item.nodes, result, regions, Math.floor(Date.now() / 1000));
			}).catch(function(error) {
				renderResult(item.nodes, { ok: false, error: error && error.message ? error.message : _('Probe failed') }, regions, Math.floor(Date.now() / 1000));
			}).finally(function() {
				item.button.disabled = false;
			});
		}

		var cardNodes = services.map(function(service) {
			var item = buildServiceCard(service);
			cards[service.id] = item;
			var previous = latestFor(records, service.id);
			if (previous)
				renderResult(item.nodes, previous, regions, previous.epoch);
			item.button.addEventListener('click', ui.createHandlerFn(this, function() {
				return run(service);
			}));
			return item.card;
		}, this);

		var runAll = E('button', { 'class': 'btn cbi-button cbi-button-apply' }, _('Run all tests'));
		runAll.addEventListener('click', ui.createHandlerFn(this, function() {
			runAll.disabled = true;
			return Promise.all(services.map(run)).finally(function() {
				runAll.disabled = false;
			});
		}));

		var clear = E('button', { 'class': 'btn cbi-button' }, _('Clear history'));
		clear.addEventListener('click', ui.createHandlerFn(this, function() {
			clear.disabled = true;
			return callClearHistory().then(function() {
				window.location.reload();
			}).finally(function() {
				clear.disabled = false;
			});
		}));

		return E('div', {}, [
			E('style', {}, `
				.ocg-test-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 18px}
				.ocg-test-actions-top{display:flex;gap:8px;flex-wrap:wrap}
				.ocg-test-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
				.ocg-test-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:16px;background:var(--background-color-high,#fff)}
				.ocg-test-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
				.ocg-test-name{font-size:1.2rem;font-weight:600}.ocg-test-endpoint{font-size:.8rem;color:var(--text-color-medium,#6b7280);word-break:break-all;margin-top:3px}
				.ocg-test-badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:.76rem;font-weight:600;white-space:nowrap}
				.ocg-test-idle{background:#e5e7eb;color:#374151}.ocg-test-running{background:#dbeafe;color:#1d4ed8}.ocg-test-ok{background:#dcfce7;color:#166534}.ocg-test-bad{background:#fee2e2;color:#991b1b}.ocg-test-warn{background:#fef3c7;color:#92400e}
				.ocg-test-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}
				.ocg-test-label{font-size:.76rem;color:var(--text-color-medium,#6b7280);margin-bottom:3px}.ocg-test-value{font-size:.94rem;overflow-wrap:anywhere}
				.ocg-test-match{padding-top:12px;border-top:1px solid var(--border-color-low,#e5e7eb)}
				.ocg-test-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}.ocg-test-last{font-size:.78rem;color:var(--text-color-medium,#6b7280)}
				.ocg-test-ok-text{color:#166534}.ocg-test-bad-text{color:#991b1b}.ocg-test-muted,.ocg-test-empty{color:var(--text-color-medium,#6b7280)}
				.ocg-test-history{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:16px;margin-top:16px;background:var(--background-color-high,#fff)}.ocg-test-history h3{margin-top:0}
				@media(max-width:520px){.ocg-test-grid{grid-template-columns:1fr}.ocg-test-footer{align-items:flex-start;flex-direction:column}}
			`),
			E('h2', {}, _('Live egress tests')),
			E('div', { 'class': 'ocg-test-toolbar' }, [
				E('p', { 'style': 'margin:0;max-width:820px' }, _('Router-origin probes show the public egress and Cloudflare edge observed for each service. Region matching uses the shared Region Registry. Source-based policy for forwarded LAN clients may differ, so this is strong diagnostic evidence, not a full client-path proof.')),
				E('div', { 'class': 'ocg-test-actions-top' }, [runAll, clear])
			]),
			E('div', { 'class': 'ocg-test-list' }, cardNodes),
			E('div', { 'class': 'ocg-test-history' }, [
				E('h3', {}, _('Recent history')),
				historyTable(records, regions),
				E('p', { 'class': 'ocg-test-last' }, _('History is bounded and volatile: up to 60 records per service in /tmp, cleared automatically on reboot.'))
			])
		]);
	}
});
