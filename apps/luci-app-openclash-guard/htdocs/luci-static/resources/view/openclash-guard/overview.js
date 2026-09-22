'use strict';
'require view';
'require rpc';

var callStatus = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getStatus',
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

function routeTarget(mode, status) {
	if (mode === 'direct')
		return _('Direct') + ' · ' + (status.directRegion || '-').toUpperCase();
	if (mode === 'proxy')
		return _('Proxy') + ' · ' + (status.proxyRegion || '-').toUpperCase();
	return _('Not configured');
}

function serviceCard(name, mode, status) {
	var configured = mode === 'direct' || mode === 'proxy';
	return E('div', { 'class': 'ocg-service' }, [
		E('div', { 'class': 'ocg-service-name' }, name),
		E('div', { 'class': 'ocg-service-route ' + (configured ? 'ocg-ok-text' : 'ocg-muted') }, routeTarget(mode, status)),
		E('div', { 'class': 'ocg-service-note' }, configured ? _('Configured route intent') : _('Route intent missing'))
	]);
}

return view.extend({
	load: function() {
		return callStatus();
	},

	render: function(status) {
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
				.ocg-ok{border-left:4px solid #2ea043}.ocg-bad{border-left:4px solid #d73a49}.ocg-warn{border-left:4px solid #bf8700}
				.ocg-panel{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:16px;margin:0 0 16px;background:var(--background-color-high,#fff)}
				.ocg-panel h3{margin-top:0}
				.ocg-route-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px}
				.ocg-route-box{padding:12px;border-radius:6px;background:var(--background-color-low,#f5f5f5)}
				.ocg-route-label{font-size:.8rem;color:var(--text-color-medium,#6b7280)}
				.ocg-route-value{font-size:1.2rem;font-weight:600;margin-top:4px}
				.ocg-services{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
				.ocg-service{padding:12px;border:1px solid var(--border-color-low,#e5e7eb);border-radius:6px}
				.ocg-service-name{font-weight:600;margin-bottom:6px}.ocg-service-route{font-size:1.05rem;margin-bottom:4px}
				.ocg-ok-text{color:#2ea043}.ocg-muted{color:var(--text-color-medium,#6b7280)}
				.ocg-profile-table td:first-child{width:180px;color:var(--text-color-medium,#6b7280)}
				.ocg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
				.ocg-note{color:var(--text-color-medium,#6b7280);font-size:.88rem;margin-top:10px}
			`),
			E('div', { 'class': 'ocg-dashboard' }, [
				E('h2', {}, _('OpenClash Guard')),
				E('p', {}, _('Operational dashboard for routing, DNS, protection state, and service egress intent.')),

				E('div', { 'class': 'ocg-grid' }, [
					card(_('Guard'), guardValue, guardDetail, stateClass(status.guardInstalled && status.configEnabled)),
					card(_('OpenClash'), status.openclashRunning ? _('Running') : _('Stopped'), _('Traffic engine'), stateClass(status.openclashRunning)),
					card(_('DNS'), dnsValue, dnsDetail + ' · ' + _('Resolver sync') + ': ' + yesNo(status.resolverSync), stateClass(status.adguardHomeRunning || status.dnsBackend !== 'adguardhome')),
					card(_('Protection'), protectionValue, protectionDetail, status.failClosed ? 'ocg-ok' : 'ocg-warn')
				]),

				E('div', { 'class': 'ocg-panel' }, [
					E('h3', {}, _('Routing policy')),
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
						serviceCard('ChatGPT', status.chatgptMode, status),
						serviceCard('Claude', status.claudeMode, status),
						serviceCard('Grok', status.grokMode, status)
					])
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
					]),
					E('div', { 'class': 'ocg-note' }, _('Like AdGuard Home, the dashboard prioritizes current operational state. Historical charts will only be added when the backend has real persisted metrics to display.'))
				])
			])
		]);
	}
});
