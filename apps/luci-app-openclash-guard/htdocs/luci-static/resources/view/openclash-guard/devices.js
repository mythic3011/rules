'use strict';
'require view';
'require form';
'require rpc';

var callGetCatalog = rpc.declare({
	object: 'luci.openclash-guard-devices',
	method: 'getCatalog',
	expect: { '': {} }
});

var callGetDevices = rpc.declare({
	object: 'luci.openclash-guard-devices',
	method: 'getDevices',
	expect: { '': {} }
});

function requireEntries(value, name) {
	if (!Array.isArray(value))
		throw new Error(_('%s catalog is unavailable.').format(name));

	var ids = Object.create(null);
	value.forEach(function(entry) {
		if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string' || !entry.label || ids[entry.id])
			throw new Error(_('%s catalog contains an invalid entry.').format(name));
		ids[entry.id] = true;
	});

	return value;
}

function requireCatalog(catalog) {
	if (!catalog || catalog.version !== 1 || !catalog.limits)
		throw new Error(_('Device profile catalog is unavailable.'));

	var limits = catalog.limits;
	if (!Number.isInteger(limits.maxDevices) || limits.maxDevices < 0 ||
	    !Number.isInteger(limits.maxLabelLength) || limits.maxLabelLength < 1 ||
	    !Number.isInteger(limits.maxRoles) || limits.maxRoles < 0 ||
	    typeof limits.deviceIdPattern !== 'string' || !limits.deviceIdPattern)
		throw new Error(_('Device profile catalog limits are invalid.'));

	var deviceIdPattern;
	try {
		deviceIdPattern = new RegExp(limits.deviceIdPattern);
	}
	catch (e) {
		throw new Error(_('Device identifier pattern is invalid.'));
	}

	return {
		roles: requireEntries(catalog.roles, _('Role')),
		profiles: requireEntries(catalog.profiles, _('Profile')),
		kinds: requireEntries(catalog.kinds, _('Kind')),
		limits: limits,
		deviceIdPattern: deviceIdPattern
	};
}

function requireDevices(result) {
	if (!result || result.version !== 1 || !Array.isArray(result.devices))
		throw new Error(_('Device suggestions are unavailable.'));

	return result.devices;
}

function matchesDeviceId(pattern, value) {
	if (typeof value !== 'string')
		return false;

	pattern.lastIndex = 0;
	return pattern.test(value);
}

function timestamp(value) {
	if (!Number.isFinite(value) || value <= 0)
		return _('Unknown');

	try {
		return new Date(value).toLocaleString();
	}
	catch (e) {
		return _('Unknown');
	}
}

function roleLabels(roles) {
	var labels = Object.create(null);
	roles.forEach(function(role) {
		labels[role.id] = role.label;
	});
	return labels;
}

function collectionStatusLabel(status) {
	var labels = Object.create(null);
	labels.partial = _('Some activity may be missing');
	labels.unsupported = _('Collection is not supported on this platform');
	labels.blocked = _('Collection is blocked');
	return labels[status] || _('Status unavailable');
}

function technicalDetails(collection, suggestions, fresh) {
	var items = [];
	if (collection && typeof collection.reason === 'string' && collection.reason)
		items.push(E('li', {}, [ _('Collection reason code: %s').format(collection.reason) ]));

	if (fresh) {
		suggestions.forEach(function(suggestion) {
			if (!suggestion)
				return;

			var details = [];
			if (typeof suggestion.confidence === 'string' && suggestion.confidence)
				details.push(_('Confidence: %s').format(suggestion.confidence));
			if (Number.isInteger(suggestion.active_bucket_count))
				details.push(_('Active buckets: %d').format(suggestion.active_bucket_count));
			if (details.length)
				items.push(E('li', {}, [ details.join(', ') ]));
		});
	}

	return items.length ? E('details', {}, [
		E('summary', {}, [ _('Technical details') ]),
		E('ul', {}, items)
	]) : null;
}

function renderSuggestions(catalog, devices, manualLabels) {
	var labels = roleLabels(catalog.roles);
	var rows = [ E('tr', { 'class': 'tr table-titles' }, [
		E('th', {}, [ _('Observation') ]),
		E('th', {}, [ _('Platform') ]),
		E('th', {}, [ _('Collection') ]),
		E('th', {}, [ _('Tentative role hints') ])
	]) ];

	devices.forEach(function(device, index) {
		if (!matchesDeviceId(catalog.deviceIdPattern, device && device.id)) {
			rows.push(E('tr', {}, [
				E('td', {}, [ _('Unavailable') ]),
				E('td', {}, [ '-' ]),
				E('td', {}, [ _('Device record is invalid') ]),
				E('td', {}, [ '-' ])
			]));
			return;
		}

		var observation = device.observation;
		var state = observation ? (device.fresh === true ? _('Fresh') : _('Stale')) : _('Not current');
		var observedAt = observation ? timestamp(observation.observed_at_ms) : _('Not available');
		var expiresAt = observation ? timestamp(observation.expires_at_ms) : _('Not available');
		var platform = observation && typeof observation.platform === 'string' ? observation.platform : _('Unknown');
		var collection = observation && observation.collection ? observation.collection : null;
		var collectionText = collectionStatusLabel(collection && collection.status);

		var suggestions = observation && device.fresh === true && Array.isArray(observation.role_suggestions) ? observation.role_suggestions : [];
		var suggestionList = suggestions.length ? E('ul', {}, suggestions.map(function(suggestion) {
			var label = suggestion && labels[suggestion.role] ? labels[suggestion.role] : _('Unknown role');
			return E('li', {}, [ label ]);
		})) : E('span', { 'class': 'ocg-muted' }, [ _('No role suggestions') ]);
		var diagnostics = technicalDetails(collection, suggestions, device.fresh === true);
		var suggestionContent = [ suggestionList ];
		if (diagnostics)
			suggestionContent.push(diagnostics);

		rows.push(E('tr', {}, [
			E('td', {}, [
				E('strong', {}, [ manualLabels[device.id] || _('Manual device %d').format(index + 1) ]),
				E('div', { 'class': 'ocg-muted' }, [ state ]),
				E('div', { 'class': 'ocg-muted' }, [ _('Observed: %s').format(observedAt) ]),
				E('div', { 'class': 'ocg-muted' }, [ _('Expires: %s').format(expiresAt) ])
			]),
			E('td', {}, [ platform ]),
			E('td', {}, [ collectionText ]),
			E('td', {}, suggestionContent)
		]));
	});

	if (!devices.length)
		return E('div', { 'class': 'ocg-panel' }, [
			E('h3', {}, [ _('Observed suggestions') ]),
			E('p', { 'class': 'ocg-muted' }, [ _('No device suggestions are available.') ]),
			E('p', {}, [ _('Suggestions are informational only. They are never copied into manual roles and do not change routing.') ])
		]);

	return E('div', { 'class': 'ocg-panel' }, [
		E('h3', {}, [ _('Observed suggestions') ]),
		E('p', {}, [ _('Role hints are tentative and may be incomplete. They never update manual roles or change routing.') ]),
		E('table', { 'class': 'table ocg-device-suggestions' }, rows)
	]);
}

function deviceMap(catalog) {
	var m = new form.Map('openclash_guard_devices', _('Devices'),
		_('Set a local device label, kind, and optional profile reference. Observed suggestions are shown separately and never change routing.'));
	var s = m.section(form.GridSection, 'device', _('Manual device profiles'));
	s.anonymous = true;
	s.addremove = true;
	s.addbtntitle = _('Add manual device');

	var deviceId = s.option(form.DummyValue, '_device_id', _('Device ID'));
	deviceId.modalonly = true;
	deviceId.cfgvalue = function(section_id) {
		return section_id;
	};
	deviceId.description = _('Save this device before binding its forced SSH key. Renaming the label does not change the ID.');

	var label = s.option(form.Value, 'label', _('Label'));
	label.rmempty = false;
	label.maxlength = catalog.limits.maxLabelLength;
	label.modalonly = false;
	label.validate = function(section_id, value) {
		value = typeof value === 'string' ? value : '';
		if (!matchesDeviceId(catalog.deviceIdPattern, section_id))
			return _('Device record is invalid. Reload this page and try again.');
		if (!value.trim())
			return _('Enter a label for this manual device.');
		if (/[\x00-\x1f\x7f]/.test(value))
			return _('Use plain text without control characters.');
		if (Array.from(value).length > catalog.limits.maxLabelLength)
			return _('Label must be %d characters or fewer.').format(catalog.limits.maxLabelLength);
		if (s.cfgsections().length > catalog.limits.maxDevices)
			return _('You can add up to %d devices.').format(catalog.limits.maxDevices);
		return true;
	};

	var kind = s.option(form.ListValue, 'kind', _('Kind'));
	kind.modalonly = false;
	catalog.kinds.forEach(function(entry) {
		kind.value(entry.id, entry.label);
	});
	kind.rmempty = false;
	if (catalog.kinds.length)
		kind.default = catalog.kinds[0].id;

	var roles = s.option(form.MultiValue, 'manual_roles', _('Manual roles'));
	roles.modalonly = true;
	catalog.roles.forEach(function(entry) {
		roles.value(entry.id, entry.label);
	});
	roles.rmempty = true;
	roles.validate = function(section_id, value) {
		var selected = Array.isArray(value) ? value : (value ? [ value ] : []);
		if (selected.length > catalog.limits.maxRoles)
			return _('Choose no more than %d roles.').format(catalog.limits.maxRoles);

		var allowed = Object.create(null);
		catalog.roles.forEach(function(entry) {
			allowed[entry.id] = true;
		});
		if (selected.some(function(id) { return !allowed[id]; }))
			return _('Choose roles from the available list.');
		return true;
	};

	var profile = s.option(form.ListValue, 'profile_id', _('Built-in profile suggestion'));
	profile.modalonly = true;
	profile.value('', _('No profile suggestion'));
	catalog.profiles.forEach(function(entry) {
		profile.value(entry.id, entry.label);
	});
	profile.default = '';
	profile.rmempty = true;
	profile.description = _('Select a built-in profile reference. This does not store an access token.');

	return { map: m, section: s, label: label };
}

return view.extend({
	load: function() {
		return Promise.all([ callGetCatalog(), callGetDevices() ]);
	},

	render: function(data) {
		var catalog = requireCatalog(data && data[0]);
		var devices = requireDevices(data && data[1]);
		var manual = deviceMap(catalog);

		return Promise.resolve(manual.map.render()).then(function(manualForm) {
			var manualLabels = Object.create(null);
			manual.section.cfgsections().forEach(function(section_id) {
				manualLabels[section_id] = manual.label.formvalue(section_id) || _('Manual device');
			});

			return E('div', {}, [
				renderSuggestions(catalog, devices, manualLabels),
				manualForm
			]);
		});
	}
});
