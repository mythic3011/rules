'use strict';
'require view';
'require rpc';

var callStatus = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getStatus',
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

function yesNo(value) {
	return value ? _('On') : _('Off');
}

function stateClass(ok) {
	return ok ? 'ocg-ok' : 'ocg-bad';
}

function card(title, value, detail, klass) {
	return E('div', { 'class': 'ocg-card ' + (klass || '') }, [
		E('div', { 'class': 'ocg-card-title' }, title),
		E('div', { 'class': 'ocg-card-value' }, value),
		E('div', { 'class': 'ocg-card-detail' }, detail || '')
	]);
}

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

function routeTarget(mode, status) {
	if (mode === 'direct')
		return _('Direct') + ' · ' + (status.directRegion || '-').toUpperCase();
	if (mode === 'proxy')
		return _('Proxy') + ' · ' + (status.proxyRegion || '-').toUpperCase();
	return _('Not configured');
}

function latestFor(records, service) {
	for (var i = 0; i < records.length; i++) {
		if (records[i].service === service)
			return records[i];
	}
	return null;
}

function trendClass(record, regions) {
	if (!record.ok)
		return 'ocg-trend-fail';
	var match = regionMatch(record, regions);
	if (match === 'match')
		return 'ocg-trend-ok';
	if (match === 'mismatch')
		return 'ocg-trend-bad';
	return 'ocg-trend-observed';
}

function serviceTrend(records, service, regions) {
	var items = records.filter(function(record) { return record.service === service; }).slice(0, 12).reverse();
	if (!items.length)
		return E('div', { 'class': 'ocg-service-note' }, _('No probe history yet'));
	return E('div', { 'class': 'ocg-trend', 'title': _('Oldest to newest') }, items.map(function(record) {
		return E('span', { 'class': 'ocg-trend-cell ' + trendClass(record, regions), 'title': formatEventTitle(record, regions) }, '');
	}));
}

function serviceCard(name, id, mode, status, records, regions) {
	var configured = mode === 'direct' || mode === 'proxy';
	var last = latestFor(records, id);
	var observed = last ? (last.ok ? [ last.country || '-', last.colo || '-', last.ip || '-' ].join(' · ') : _('Last probe failed')) : _('Not tested yet');
	return E('div', { 'class': 'ocg-service' }, [
		E('div', { 'class': 'ocg-service-name' }, name),
		E('div', { 'class': 'ocg-service-route ' + (configured ? 'ocg-ok-text' : 'ocg-muted') }, routeTarget(mode, status)),
		E('div', { 'class': 'ocg-service-observed' }, observed),
		serviceTrend(records, id, regions)
	]);
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

function expectedText(record, regions) {
	if (!record || !record.expectedMode)
		return '-';
	var text = record.expectedMode === 'direct' ? _('Direct') : record.expectedMode === 'proxy' ? _('Proxy') : record.expectedMode;
	if (record.expectedRegion) {
		var region = regions[record.expectedRegion];
		text += ' · ' + (region && region.name ? region.name : record.expectedRegion.toUpperCase());
	}
	return text;
}

function eventStatus(record, regions) {
	if (!record.ok)
		return { klass: 'ocg-event-fail', text: _('Failed') };
	var match = regionMatch(record, regions);
	if (match === 'match')
		return { klass: 'ocg-event-ok', text: _('Match') };
	if (match === 'mismatch')
		return { klass: 'ocg-event-bad', text: _('Mismatch') };
	return { klass: 'ocg-event-observed', text: _('Observed') };
}

function formatEventTitle(record, regions) {
	var status = eventStatus(record, regions).text;
	var observed = record.ok ? [ record.country || '-', record.colo || '-', record.ip || '-' ].join(' · ') : (record.error || _('Probe failed'));
	return status + ' · ' + observed + ' · ' + expectedText(record, regions);
}

function recentEvents(records, regions) {
	if (!records.length)
		return E('div', { 'class': 'ocg-empty' }, _('No egress observations yet. Run the service tests to populate this dashboard.'));
	return E('table', { 'class': 'table ocg-events' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', {}, _('Time')),
			E('th', {}, _('Service')),
			E('th', {}, _('Observed')),
			E('th', {}, _('Expected')),
			E('th', {}, _('Result'))
		])
	].concat(records.slice(0, 8).map(function(record) {
		var status = eventStatus(record, regions);
		var observed = record.ok ? [ record.country || '-', record.colo || '-', record.ip || '-' ].join(' · ') : (record.error || _('Probe failed'));
		return E('tr', {}, [
			E('td', {}, formatTime(record.epoch)),
			E('td', {}, record.service || '-'),
			E('td', {}, observed),
			E('td', {}, expectedText(record, regions)),
			E('td', {}, E('span', { 'class': 'ocg-event-badge ' + status.klass }, status.text))
		]);
	})));
}

return view.extend({
	load: function() {
		return Promise.all([ callStatus(), callRegions(), callHistory() ]);
	},

	render: function(data) {
		var status = data[0] || {};
		var regions = regionMap(data[1] || {});
		var records = data[2] && Array.isArray(data[2].records) ? data[2].records : [];
		var cutoff = Math.floor(Date.now() / 1000) - 86400;
		var last24 = records.filter(function(record) { return record.epoch >= cutoff; });
		var matches = 0;
		var mismatches = 0;
		var failures = 0;
		last24.forEach(function(record) {
			if (!record.ok) {
				failures++;
				return;
			}
			var match = regionMatch(record, regions);
			if (match === 'match')
				matches++;
			else if (match === 'mismatch')
				mismatches++;
		});

		var dnsValue = status.adguardHomeRunning ? _('AdGuard Home') : (status.dnsBackend || _('Auto'));
		var dnsDetail = status.adguardHomeRunning ? _('Running') : _('Configured backend') + ': ' + (status.dnsBackend || 'auto');
		var guardValue = status.guardInstalled ? _('Installed') : _('Missing');
		var guardDetail = _('Configuration') + ': ' + (status.configEnabled ? _('Enabled') : _('Disabled'));
		var protectionValue = status.failClosed ? _('Fail closed') : _('Relaxed');
		var protectionDetail = _('Auto refresh') + ': ' + yesNo(status.autoRefresh);

		return E('div', {}, [
			E('style', {}, `
				.ocg-dashboard{max-width:1280px}
				.ocg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0 20px}
				.ocg-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:16px;background:var(--background-color-high,#fff);min-height:108px;box-sizing:border-box}
				.ocg-card-title{font-size:.85rem;color:var(--text-color-medium,#6b7280);margin-bottom:8px}
				.ocg-card-value{font-size:1.55rem;font-weight:600;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere}
				.ocg-card-detail,.ocg-service-note{font-size:.82rem;color:var(--text-color-medium,#6b7280)}
				.ocg-ok{border-left:4px solid #2ea043}.ocg-bad{border-left:4px solid #d73a49}.ocg-warn{border-left:4px solid #bf8700}.ocg-neutral{border-left:4px solid #6b7280}
				.ocg-panel{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:16px;margin:0 0 16px;background:var(--background-color-high,#fff)}
				.ocg-panel h3{margin-top:0}
				.ocg-route-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px}
				.ocg-route-box{padding:12px;border-radius:6px;background:var(--background-color-low,#f5f5f5)}
				.ocg-route-label{font-size:.8rem;color:var(--text-color-medium,#6b7280)}
				.ocg-route-value{font-size:1.2rem;font-weight:600;margin-top:4px}
				.ocg-services{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
				.ocg-service{padding:12px;border:1px solid var(--border-color-low,#e5e7eb);border-radius:6px}
				.ocg-service-name{font-weight:600;margin-bottom:6px}.ocg-service-route{font-size:1.05rem;margin-bottom:4px}.ocg-service-observed{font-size:.82rem;color:var(--text-color-medium,#6b7280);overflow-wrap:anywhere;margin-bottom:9px}
				.ocg-ok-text{color:#2ea043}.ocg-muted{color:var(--text-color-medium,#6b7280)}
				.ocg-profile-table td:first-child{width:180px;color:var(--text-color-medium,#6b7280)}
				.ocg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
				.ocg-note,.ocg-empty{color:var(--text-color-medium,#6b7280);font-size:.88rem;margin-top:10px}
				.ocg-trend{display:flex;gap:3px;align-items:center;height:9px}.ocg-trend-cell{display:block;flex:1;max-width:22px;height:7px;border-radius:2px;background:#9ca3af}.ocg-trend-ok{background:#2ea043}.ocg-trend-bad,.ocg-trend-fail{background:#d73a49}.ocg-trend-observed{background:#bf8700}
				.ocg-event-badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:.74rem;font-weight:600}.ocg-event-ok{background:#dcfce7;color:#166534}.ocg-event-bad,.ocg-event-fail{background:#fee2e2;color:#991b1b}.ocg-event-observed{background:#fef3c7;color:#92400e}
				.ocg-events td{vertical-align:middle}.ocg-events td:nth-child(3){overflow-wrap:anywhere}
			`),
			E('div', { 'class': 'ocg-dashboard' }, [
				E('h2', {}, _('OpenClash Guard')),
				E('p', {}, _('Operational dashboard for routing, DNS, protection state, and observed service egress.')),

				E('div', { 'class': 'ocg-grid' }, [
					card(_('Guard'), guardValue, guardDetail, stateClass(status.guardInstalled && status.configEnabled)),
					card(_('OpenClash'), status.openclashRunning ? _('Running') : _('Stopped'), _('Traffic engine'), stateClass(status.openclashRunning)),
					card(_('DNS'), dnsValue, dnsDetail + ' · ' + _('Resolver sync') + ': ' + yesNo(status.resolverSync), stateClass(status.adguardHomeRunning || status.dnsBackend !== 'adguardhome')),
					card(_('Protection'), protectionValue, protectionDetail, status.failClosed ? 'ocg-ok' : 'ocg-warn')
				]),

				E('div', { 'class': 'ocg-panel' }, [
					E('h3', {}, _('Egress observations · last 24 hours')),
					E('div', { 'class': 'ocg-grid' }, [
						card(_('Probes'), String(last24.length), _('Volatile router-side observations'), last24.length ? 'ocg-neutral' : 'ocg-warn'),
						card(_('Matches'), String(matches), _('Observed country matched configured region'), matches ? 'ocg-ok' : 'ocg-neutral'),
						card(_('Mismatches'), String(mismatches), _('Observed country differed from configured region'), mismatches ? 'ocg-bad' : 'ocg-ok'),
						card(_('Failures'), String(failures), _('Probe or response validation failures'), failures ? 'ocg-bad' : 'ocg-ok')
					]),
					E('div', { 'class': 'ocg-note' }, _('History is bounded and stored in /tmp only. It is cleared on reboot and does not write routine metrics to flash.'))
				]),

				E('div', { 'class': 'ocg-panel' }, [
					E('h3', {}, _('Routing policy & recent egress')),
					E('div', { 'class': 'ocg-route-summary' }, [
						E('div', { 'class': 'ocg-route-box' }, [
							E('div', { 'class': 'ocg-route-label' }, _('Direct region')),
							E('div', { 'class': 'ocg-route-value' }, (status.directRegion || '-').toUpperCase())
						]),
						E('div', { 'class': 'ocg-route-box' }, [
							E('div', { 'class': 'ocg-route-label' }, _('Proxy region')),
							E('div', { 'class': 'ocg-route-value' }, (status.proxyRegion || '-').toUpperCase())
						])
					]),
					E('div', { 'class': 'ocg-services' }, [
						serviceCard('ChatGPT', 'chatgpt', status.chatgptMode, status, records, regions),
						serviceCard('Claude', 'claude', status.claudeMode, status, records, regions),
						serviceCard('Grok', 'grok', status.grokMode, status, records, regions)
					])
				]),

				E('div', { 'class': 'ocg-panel' }, [
					E('h3', {}, _('Recent egress events')),
					recentEvents(records, regions)
				]),

				E('div', { 'class': 'ocg-panel' }, [
					E('h3', {}, _('Profile & distribution')),
					E('table', { 'class': 'table ocg-profile-table' }, [
						E('tr', {}, [E('td', {}, _('Profile mode')), E('td', {}, status.profileMode || '-')]),
						E('tr', {}, [E('td', {}, _('Profile URL')), E('td', { 'style': 'word-break:break-all' }, status.profileUrl || _('Not configured'))]),
						E('tr', {}, [E('td', {}, _('Distribution source')), E('td', {}, status.distributionSource || 'auto')]),
						E('tr', {}, [E('td', {}, _('Automatic refresh')), E('td', {}, yesNo(status.autoRefresh))])
					]),
					E('div', { 'class': 'ocg-actions' }, [
						E('a', { 'class': 'btn cbi-button cbi-button-action', 'href': L.url('admin/services/openclash-guard/tests') }, _('Run egress tests')),
						E('a', { 'class': 'btn cbi-button', 'href': L.url('admin/services/openclash-guard/profile') }, _('Edit profile')),
						E('a', { 'class': 'btn cbi-button', 'href': L.url('admin/services/openclash-guard/routing') }, _('Edit routing'))
					])
				])
			])
		]);
	}
});
