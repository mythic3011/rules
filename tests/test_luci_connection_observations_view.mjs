import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { containsTextNode, evaluateLuCIView, makeEFixture, makeTranslator } from './luci_view_fixture.mjs';

const source = readFileSync(new URL('../apps/luci-app-openclash-guard/htdocs/luci-static/resources/view/openclash-guard/connections.js', import.meta.url), 'utf8');
function walk(node, predicate) {
	if (predicate(node)) return node;
	for (const child of node.children || []) {
		const found = walk(child, predicate);
		if (found) return found;
	}
}
function fixture() {
	const { E, scalarHtmlContexts } = makeEFixture();
	let tick;
	const component = evaluateLuCIView(source, {
		view: { extend: value => value }, E, _: makeTranslator(),
		poll: { add: callback => { tick = callback; } },
		dom: { content: (node, children) => { node.children = children; } }
	});
	const tree = component.render();
	const input = walk(tree, node => node.tag === 'input');
	return { tree, scalarHtmlContexts, tick: () => tick(),
		loadFile: file => {
			input.files = [ file ];
			return input.listeners[0].listener();
		},
		load: async (value, size = 100) => {
			input.files = [ { size, text: async () => JSON.stringify(value) } ];
			await input.listeners[0].listener();
		},
		clear: () => walk(tree, node => node.tag === 'button').attributes.click()
	};
}
function snapshot() {
	return {
		version: 1, observed_at_ms: Date.now(), ttl_ms: 30000,
		authorization: 'OBSERVATION_ONLY_NO_RULE_WRITES_NO_METADATA_INJECTION',
		sources: { mihomo: { status: 'OBSERVED', detail: 'fixture' } },
		connection_context: [ { hostname: '<img onerror=bad()>', tuple: { destination: '203.0.113.7:443', network: 'Tcp' },
			process_path: '/fixture/client', pid_match: 'AMBIGUOUS', chains: ['fixture-proxy'], rule: 'Domain' } ],
		little_snitch_observations: [ { executable: '/fixture/client', destination: '203.0.113.7:443', denied_attempts: 2 } ]
	};
}
test('endpoint routes and separate deny statistics never become firewall verdicts or HTML', async () => {
	const f = fixture();
	await f.load(snapshot());
	for (const value of ['<img onerror=bad()>', 'Several possible connections or owners', 'fixture-proxy', 'Domain', 'Unknown — routing observation only'])
		assert.ok(containsTextNode(f.tree, value));
	assert.deepEqual(f.scalarHtmlContexts, []);
	f.clear();
	assert.equal(containsTextNode(f.tree, '/fixture/client'), false);
});
test('expired, future, invalid and oversized snapshots clear previous observations', async () => {
	for (const change of [s => { s.observed_at_ms -= 31000; }, s => { s.observed_at_ms += 10000; },
		s => { s.authorization = 'trusted'; }, s => { s.ttl_ms = -1; }, s => { s.sources = null; }]) {
		const f = fixture();
		await f.load(snapshot());
		const invalid = snapshot(); change(invalid);
		await f.load(invalid);
		assert.equal(containsTextNode(f.tree, '/fixture/client'), false);
	}
	const f = fixture(); await f.load(snapshot(), 3 * 1024 * 1024);
	assert.ok(containsTextNode(f.tree, 'no larger than 2 MiB'));
});
test('a paused or clock-shifted display expires without retaining PID associations', async () => {
	const f = fixture();
	const s = snapshot(); s.ttl_ms = 1;
	await f.load(s);
	await new Promise(resolve => setTimeout(resolve, 5));
	f.tick();
	assert.equal(containsTextNode(f.tree, '/fixture/client'), false);
});

test('learning groups only the current snapshot and preserves uncertain attribution', async () => {
	const f = fixture(); const s = snapshot();
	s.connection_context.push({ ...s.connection_context[0], hostname: 'other.test' });
	await f.load(s);
	assert.ok(containsTextNode(f.tree, 'Learning preview'));
	assert.ok(containsTextNode(f.tree, 'Several possible connections or owners'));
	assert.ok(containsTextNode(f.tree, 'not successful connections'));
	const patterns = walk(f.tree, node => node.tag === 'table' && node.textContent.includes('Attribution coverage'));
	assert.equal(patterns.children.length, 2);
	assert.equal(patterns.children[1].children.at(-1).textContent, '2');
	await f.load({ ...snapshot(), connection_context: [], little_snitch_observations: [] });
	assert.equal(containsTextNode(f.tree, '/fixture/client'), false);
});

test('clearing observations fences a pending file read', async () => {
	const f = fixture(); let complete;
	const pending = f.loadFile({ size: 100, text: () => new Promise(resolve => { complete = resolve; }) });
	f.clear();
	complete(JSON.stringify(snapshot()));
	await pending;
	assert.equal(containsTextNode(f.tree, '/fixture/client'), false);
	assert.ok(containsTextNode(f.tree, 'Snapshot cleared.'));
});
