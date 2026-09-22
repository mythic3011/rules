'use strict';
'require view';
'require rpc';

var callStatus = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getStatus',
	expect: { '': {} }
});

function stateText(value) {
	return value ? _('Yes') : _('No');
}

return view.extend({
	load: function() {
		return callStatus();
	},

	render: function(status) {
		return E('div', {}, [
			E('h2', {}, _('OpenClash Guard')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Runtime overview')),
				E('table', { 'class': 'table' }, [
					E('tr', {}, [E('td', {}, _('Guard installed')), E('td', {}, stateText(status.guardInstalled))]),
					E('tr', {}, [E('td', {}, _('OpenClash running')), E('td', {}, stateText(status.openclashRunning))]),
					E('tr', {}, [E('td', {}, _('AdGuard Home running')), E('td', {}, stateText(status.adguardHomeRunning))]),
					E('tr', {}, [E('td', {}, _('Direct region')), E('td', {}, status.directRegion || '-')]),
					E('tr', {}, [E('td', {}, _('Proxy region')), E('td', {}, status.proxyRegion || '-')]),
					E('tr', {}, [E('td', {}, _('Profile URL')), E('td', { 'style': 'word-break:break-all' }, status.profileUrl || _('Not configured'))])
				])
			]),
			E('p', {}, _('Configuration is stored in UCI and shared with the runtime. This page does not scrape CLI text output.'))
		]);
	}
});
