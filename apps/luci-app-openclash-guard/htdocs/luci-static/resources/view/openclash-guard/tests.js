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
	if (!result || !result.expectedRegion || !result.country)
		return 'unknown';
	var region = regions[result.expectedRegion];
	if (!region || !Array.isArray(region.countryCodes) || region.countryCodes.length === 0)
		return 'unknown';
	return region.countryCodes.indexOf(result.country) >= 0 ? 'match' : 'mismatch';
}

function describe(result, regions) {
	if (!result || !result.ok)
		return result && result.error ? result.error : _('Probe failed');
	var observed = [ result.ip || '-', result.country || '-', result.colo || '-', result.http || '-', result.tls || '-' ].join(' · ');
	var expected = result.expectedMode || 'auto';
	if (result.expectedRegion)
		expected += '/' + result.expectedRegion;
	return observed + ' | ' + _('expected') + ': ' + expected + ' | ' + _('region') + ': ' + regionMatch(result, regions);
}

return view.extend({
	load: function() {
		return callRegions();
	},

	render: function(catalog) {
		var regions = regionMap(catalog);
		var rows = {};
		var body = services.map(function(service) {
			var resultCell = E('td', { 'style': 'word-break:break-word' }, _('Not tested'));
			var button = E('button', { 'class': 'btn cbi-button cbi-button-action' }, _('Run'));
			button.addEventListener('click', ui.createHandlerFn(this, function() {
				resultCell.textContent = _('Testing…');
				return callTrace(service.id).then(function(result) {
					resultCell.textContent = describe(result, regions);
				});
			}));
			rows[service.id] = resultCell;
			return E('tr', {}, [
				E('td', {}, service.label),
				E('td', {}, service.endpoint),
				resultCell,
				E('td', {}, button)
			]);
		}, this);

		var runAll = E('button', { 'class': 'btn cbi-button cbi-button-apply' }, _('Run all'));
		runAll.addEventListener('click', ui.createHandlerFn(this, function() {
			services.forEach(function(service) { rows[service.id].textContent = _('Testing…'); });
			return Promise.all(services.map(function(service) {
				return callTrace(service.id).then(function(result) {
					rows[service.id].textContent = describe(result, regions);
				});
			}));
		}));

		return E('div', {}, [
			E('h2', {}, _('Live egress tests')),
			E('p', {}, _('The requests originate on the router through fixed service trace endpoints. They show observed public egress and Cloudflare edge data. Region matching uses the shared Region Registry. Source-based policies for forwarded LAN clients can differ, so a match is evidence, not a full path proof.')),
			E('p', {}, runAll),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('Service')),
					E('th', {}, _('Probe')),
					E('th', {}, _('Observed result')),
					E('th', {}, _('Action'))
				])
			].concat(body))
		]);
	}
});
