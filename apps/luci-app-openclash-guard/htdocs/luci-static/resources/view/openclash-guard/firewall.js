'use strict';
'require view';
'require rpc';
'require poll';
'require dom';

var callSnapshot = rpc.declare({
	object: 'luci.openclash-guard', method: 'getFirewallObservations', expect: { '': {} }
});

function value(input, fallback) {
	return typeof input === 'string' ? input : fallback;
}

function count(input) {
	return Number.isSafeInteger(input) && input >= 0 ? String(input) : _('Unknown');
}

function decision(row) {
	if (row.decision === 'accept') return _('Accept at this Guard hook; later decisions unknown');
	if (row.decision === 'reject') return _('Reject at this Guard hook');
	if (row.decision === 'drop') return _('Drop at this Guard hook');
	return _('Unknown rule decision');
}

function table(snapshot) {
	var coverage = snapshot.coverage;
	var rows = snapshot.rules;
	return E('div', {}, [
		E('p', {}, [ _('Coverage is partial. Rule explanations are catalog references; complete rule semantics and the applied policy revision are unverified. Packet totals do not identify applications, unique connections, or successful delivery.') ]),
		E('ul', {}, [
			E('li', {}, [ _('Guard table present') + ': ' + (coverage.targetTablePresent ? _('Yes') : _('No')) ]),
			E('li', {}, [ _('Rules without usable counters') + ': ' + count(coverage.counterUnavailableCount) ]),
			E('li', {}, [ _('Unknown Guard rule references') + ': ' + count(coverage.unknownRuleCount) ]),
			E('li', {}, [ _('Flowtables observed') + ': ' + (coverage.flowtablesPresent ? _('Yes — traffic may bypass Guard hooks') : _('None in this snapshot; acceleration coverage remains unverified')) ]),
			E('li', {}, [ _('Hardware offload flag observed') + ': ' + (coverage.hardwareOffloadFlagPresent ? _('Yes') : _('No; other hardware acceleration remains unverified')) ]),
			E('li', {}, [ _('Configured policy revision (not verification of applied policy)') + ': ' + value(snapshot.policy.configuredRevision, _('Unknown')) ])
		]),
		coverage.truncated ? E('p', { 'role': 'status' }, [ _('The record limit was reached; this table omits additional rules.') ]) : null,
		E('p', {}, [ _('Counters describe packets and bytes since rule creation or reset. A missing counter is shown as unknown, never as zero. No cross-refresh rate or connection count is inferred.') ]),
		E('table', { 'class': 'table' }, [
			E('tr', {}, [ _('Rule reference'), _('Catalog explanation'), _('Hook decision'), _('Packets'), _('Bytes'), _('Observation') ].map(function(label) { return E('th', {}, [ label ]); }))
		].concat(rows.map(function(row) {
			row = row && typeof row === 'object' ? row : {};
			var counted = row.status === 'counter-observed';
			return E('tr', {}, [
				value(row.chain, _('Unknown')) + ' / ' + value(row.ruleId, _('Unknown')),
				value(row.reason, _('Explanation unavailable')),
				decision(row),
				counted ? count(row.packets) : _('Unknown'),
				counted ? count(row.bytes) : _('Unknown'),
				value(row.status, _('Unavailable'))
			].map(function(cell) { return E('td', {}, [ cell ]); }));
		}))),
		rows.length ? null : E('p', {}, [ _('No recognized Guard rules were observed. This is not evidence that traffic was allowed or blocked.') ])
	]);
}

return view.extend({
	load: function() {
		return callSnapshot().catch(function() { return { ok: false }; });
	},
	render: function(initial) {
		var snapshot = null;
		var generation = 0;
		var pending = null;
		var receivedAt = 0;
		var remainingLifetime = 0;
		var notice = E('p', { 'role': 'status', 'aria-live': 'polite' }, []);
		var content = E('div');
		var refreshButton;
		function clear(message) {
			snapshot = null;
			dom.content(content, []);
			notice.textContent = message;
		}
		function apply(data) {
			clear(_('Router observations are unavailable. Refresh to try again.'));
			if (!data || data.ok !== true || data.version !== 1 || data.kind !== 'rule-counter-snapshot' ||
				data.authorization !== 'READ_ONLY_NO_ROUTING_AUTHORITY' || !Array.isArray(data.rules) ||
				!data.coverage || data.coverage.status !== 'partial' || !data.policy || data.policy.binding !== 'unverified' ||
				!Number.isSafeInteger(data.observedAtMs) || !Number.isSafeInteger(data.ttlMs) || data.ttlMs <= 0)
				return;
			var age = Date.now() - data.observedAtMs;
			if (age < 0 || age >= data.ttlMs) {
				clear(_('Snapshot expired or router/browser clocks disagree. Refresh after checking the clocks.'));
				return;
			}
			snapshot = data;
			receivedAt = performance.now();
			remainingLifetime = data.ttlMs - age;
			dom.content(content, [ table(data) ]);
			notice.textContent = _('Current read-only rule snapshot. Refresh to collect another snapshot.');
		}
		function expire() {
			if (!snapshot) return;
			var elapsed = performance.now() - receivedAt;
			var age = Date.now() - snapshot.observedAtMs;
			if (elapsed < 0 || elapsed >= remainingLifetime || age < 0 || age >= snapshot.ttlMs)
				clear(_('Router snapshot expired. Refresh to collect current rule observations.'));
		}
		function refresh() {
			if (pending) return pending;
			var current = ++generation;
			clear(_('Reading current router rules…'));
			refreshButton.disabled = true;
			pending = Promise.resolve().then(callSnapshot).then(function(data) {
				if (current === generation) apply(data);
			}, function() {
				if (current === generation) clear(_('Router observations are unavailable. Refresh to try again.'));
			}).finally(function() {
				if (current === generation) { pending = null; refreshButton.disabled = false; }
			});
			return pending;
		}
		refreshButton = E('button', { 'type': 'button', 'class': 'btn', 'click': refresh }, [ _('Refresh router snapshot') ]);
		poll.add(expire, 1);
		document.addEventListener('visibilitychange', expire);
		window.addEventListener('pagehide', function() {
			generation++; pending = null; refreshButton.disabled = false;
			clear(_('Router snapshot cleared on leaving this page.'));
		});
		apply(initial);
		return E('div', {}, [
			E('h2', {}, [ _('Firewall rule observations') ]),
			E('p', {}, [ _('Read the router rules without changing the firewall. This view stores no traffic history and does not automatically poll the router. Endpoint connection context remains a separate advisory source.') ]),
			refreshButton, notice, content
		]);
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
