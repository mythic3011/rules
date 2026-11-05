'use strict';
'require view';
'require poll';
'require dom';

// Endpoint wire fields are owned by endpoint-guard/src/endpoint.rs.
// These limits bound this browser view, independently of producer capacity.
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var MAX_DISPLAY_ROWS = 200;
var MAX_DISPLAY_AGE_MS = 30000;
var AUTHORIZATION = 'OBSERVATION_ONLY_NO_RULE_WRITES_NO_METADATA_INJECTION';

function text(value, fallback) {
	return typeof value === 'string' && value.length ? value : fallback;
}

function attribution(value) {
	switch (value) {
		case 'UNIQUE_TUPLE_SNAPSHOT_NOT_IDENTITY': return _('One socket owner matched; application identity is unverified');
		case 'AMBIGUOUS': return _('Several possible connections or owners; application is uncertain');
		case 'PROCESS_PATH_CONFLICT': return _('Process observations disagree');
		case 'INCOMPLETE_TUPLE': return _('Connection addresses or ports are incomplete');
		case 'UNMATCHED': return _('No matching local socket owner was observed');
		default: return _('Application attribution is unavailable');
	}
}

function currentSnapshot(snapshot, now) {
	return snapshot && snapshot.version === 1 && snapshot.authorization === AUTHORIZATION &&
		Number.isSafeInteger(snapshot.observed_at_ms) && Number.isSafeInteger(snapshot.ttl_ms) &&
		snapshot.ttl_ms > 0 && now >= snapshot.observed_at_ms &&
		now - snapshot.observed_at_ms < Math.min(snapshot.ttl_ms, MAX_DISPLAY_AGE_MS) &&
		Array.isArray(snapshot.connection_context) && snapshot.sources &&
		Array.isArray(snapshot.little_snitch_observations);
}

function cells(values, tag) {
	return values.map(function(value) { return E(tag || 'td', {}, [ value ]); });
}

function learningPreview(rows) {
	var patterns = new Map();
	rows.forEach(function(row) {
		if (!row || typeof row !== 'object') return;
		var route = Array.isArray(row.chains) ? row.chains.filter(function(value) { return typeof value === 'string'; }).join(' → ') : '';
		var values = [ text(row.process_path, _('Process unavailable')), route || _('Route unavailable'), text(row.rule, _('Rule unavailable')), attribution(row.pid_match) ];
		var key = JSON.stringify(values);
		var pattern = patterns.get(key);
		if (pattern) pattern.count++;
		else patterns.set(key, { values: values, count: 1 });
	});
	return E('div', {}, [
		E('h3', {}, [ _('Learning preview · current snapshot') ]),
		E('p', {}, [ _('These patterns summarize the displayed observations for manual review. Counts describe records in this snapshot, not successful connections. Learning does not create allow rules or change protection. Patterns expire with the snapshot.') ]),
		E('table', { 'class': 'table' }, [ E('tr', {}, cells([ _('Application observation'), _('Reported route'), _('Matched rule'), _('Attribution coverage'), _('Records') ], 'th')) ].concat(
			Array.from(patterns.values()).map(function(pattern) { return E('tr', {}, cells(pattern.values.concat(String(pattern.count)))); })
		))
	]);
}

function observations(snapshot) {
	var rows = snapshot.connection_context.slice(0, MAX_DISPLAY_ROWS);
	return E('div', {}, [
		E('p', {}, [ _('Reported routing is shown below. Firewall allow/block verdict: unknown. A listed connection does not prove successful delivery; missing connections do not prove a block.') ]),
		E('table', { 'class': 'table' }, [
			E('tr', {}, cells([ _('Destination'), _('Application observation'), _('Reported route'), _('Matched rule'), _('Firewall verdict') ], 'th'))
		].concat(rows.map(function(row) {
			row = row && typeof row === 'object' ? row : {};
			var tuple = row.tuple && typeof row.tuple === 'object' ? row.tuple : {};
			var route = Array.isArray(row.chains) ? row.chains.filter(function(value) { return typeof value === 'string'; }).join(' → ') : '';
			return E('tr', {}, cells([
				text(row.hostname, _('Hostname unavailable')) + ' · ' + text(tuple.destination, _('Endpoint unavailable')) + ' · ' + text(tuple.network, _('Transport unknown')),
				text(row.process_path, _('Process unavailable')) + ' · ' + attribution(row.pid_match),
				route || _('Route unavailable'),
				text(row.rule, _('Rule unavailable')),
				_('Unknown — routing observation only')
			]));
		}))),
		E('p', {}, [ rows.length ? _('Showing up to 200 connections from this snapshot.') : _('No connections were reported. Collection gaps and short-lived or rejected attempts may be absent.') ]),
		learningPreview(rows),
		E('h3', {}, [ _('Collection coverage') ]),
		E('ul', {}, [ 'mihomo', 'sockets', 'little_snitch' ].map(function(name) {
			var source = snapshot.sources[name] || {};
			return E('li', {}, [ name + ': ' + text(source.status, _('Unknown')) + ' · ' + text(source.detail, _('No source detail')) ]);
		})),
		E('h3', {}, [ _('Separate denied-attempt statistics') ]),
		E('p', {}, [ _('Little Snitch statistics are caller-supplied aggregate context. They are not router verdicts and cannot be assigned to an individual connection.') ]),
		E('table', { 'class': 'table' }, [ E('tr', {}, cells([ _('Application observation'), _('Remote endpoint'), _('Denied attempts') ], 'th')) ].concat(
			snapshot.little_snitch_observations.slice(0, MAX_DISPLAY_ROWS).map(function(row) {
				row = row && typeof row === 'object' ? row : {};
				return E('tr', {}, cells([ text(row.executable, _('Unknown')), text(row.destination, _('Unknown')),
					Number.isSafeInteger(row.denied_attempts) && row.denied_attempts >= 0 ? String(row.denied_attempts) : _('Unknown') ]));
			})
		))
	]);
}

return view.extend({
	render: function() {
		var snapshot = null;
		var generation = 0;
		var notice = E('p', { 'role': 'status', 'aria-live': 'polite' }, [ _('No endpoint snapshot loaded. No connection verdicts are available.') ]);
		var content = E('div');
		var input = E('input', { 'type': 'file', 'accept': '.json,application/json', 'aria-label': _('Choose a local endpoint snapshot') });
		function clear(message) {
			snapshot = null;
			input.value = '';
			dom.content(content, []);
			notice.textContent = message;
		}
		input.addEventListener('change', async function() {
			var current = ++generation;
			var file = input.files && input.files[0];
			clear(_('Reading local snapshot…'));
			if (!file || file.size > MAX_FILE_BYTES) {
				clear(_('Choose a JSON snapshot no larger than 2 MiB.'));
				return;
			}
			try {
				var parsed = JSON.parse(await file.text());
				if (current !== generation) return;
				if (!currentSnapshot(parsed, Date.now())) {
					clear(_('Snapshot unavailable: unsupported, expired, future-dated, or invalid. Export a fresh endpoint snapshot.'));
					return;
				}
				snapshot = parsed;
				dom.content(content, [ observations(snapshot) ]);
				notice.textContent = _('Local advisory snapshot loaded. It will clear when its validity expires.');
			} catch (error) {
				if (current === generation) clear(_('Unable to read a valid endpoint snapshot.'));
			}
		});
		poll.add(function() {
			if (snapshot && !currentSnapshot(snapshot, Date.now())) clear(_('Snapshot expired. Export a fresh snapshot; previous connection associations have been cleared.'));
		}, 1);
		return E('div', {}, [
			E('h2', {}, [ _('Connection observations') ]),
			E('p', {}, [ _('Inspect a local endpoint-agent snapshot to understand reported application routes and matching rules. The file stays in this browser tab; nothing is uploaded, saved to router storage, or used to change routing.') ]),
			E('p', {}, [ _('On the endpoint, run clash-guard-agent snapshot with your selected controller and save its JSON output locally. Choose that file here within its validity window. This is a manual snapshot, not a live connection feed.') ]),
			input,
			E('button', { 'class': 'btn', 'type': 'button', 'click': function() { generation++; clear(_('Snapshot cleared.')); } }, [ _('Clear observations') ]),
			notice, content
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
