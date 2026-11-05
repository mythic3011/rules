import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { containsTextNode, evaluateLuCIView, makeEFixture, makeTranslator } from './luci_view_fixture.mjs';
const source = readFileSync(new URL('../apps/luci-app-openclash-guard/htdocs/luci-static/resources/view/openclash-guard/firewall.js', import.meta.url), 'utf8');
function fixture(initial) {
 const { E, scalarHtmlContexts } = makeEFixture();
 let tick, resolve, reject, calls = 0, wall = Date.now(), mono = 0;
 const events = new Map();
 const component = evaluateLuCIView(source, {
  view: { extend: v => v }, E, _: makeTranslator(),
  rpc: { declare: () => () => { calls++; return new Promise((a,b) => { resolve=a; reject=b; }); } },
  Date: { now: () => wall }, performance: { now: () => mono },
  poll: { add: f => { tick=f; } }, dom: { content: (n,c) => { n.children=c; } },
  document: { addEventListener: (n,f) => events.set(n,f) },
  window: { addEventListener: (n,f) => events.set(n,f) }
 });
 const tree = component.render(initial);
 const button = tree.children.find(n => n.tag === 'button');
 return { tree, scalarHtmlContexts, refresh: () => button.attributes.click(),
  calls: () => calls, resolve: v => resolve(v), reject: () => reject(new Error('fixture')),
  tick: () => tick(), event: n => events.get(n)(),
  advance: ms => { wall += ms; mono += ms; } };
}
function snapshot() {
 return { ok:true, version:1, kind:'rule-counter-snapshot', authorization:'READ_ONLY_NO_ROUTING_AUTHORITY',
  observedAtMs:Date.now(), ttlMs:10000, policy:{ binding:'unverified', configuredRevision:'fixture' },
  coverage:{status:'partial',counterUnavailableCount:1,unknownRuleCount:0},
  rules:[{chain:'forward',ruleId:'fixture-rule',reason:'<img onerror=bad()>',decision:'accept',status:'counter-unavailable',packets:null,bytes:null}] };
}
test('missing counters stay unknown, explanations are text and accepts remain hook scoped', () => {
 const f=fixture(snapshot());
 assert.ok(containsTextNode(f.tree,'<img onerror=bad()>'));
 assert.ok(containsTextNode(f.tree,'later decisions unknown'));
 assert.ok(containsTextNode(f.tree,'Unknown'));
 assert.deepEqual(f.scalarHtmlContexts,[]);
 const s=snapshot(); s.rules[0]={...s.rules[0],status:'counter-observed',packets:0,bytes:0};
 const g=fixture(s); assert.ok(containsTextNode(g.tree,'0'));
});
test('refresh coalesces requests and failures clear old observations', async () => {
 const f=fixture(snapshot()); const a=f.refresh(), b=f.refresh(); assert.equal(a,b);
 assert.equal(containsTextNode(f.tree,'fixture-rule'),false);
 await Promise.resolve(); assert.equal(f.calls(),1); f.reject(); await a;
 assert.ok(containsTextNode(f.tree,'unavailable'));
});
test('expiry and page departure clear observations and fence late responses', async () => {
 const f=fixture(snapshot()); f.advance(11000); f.event('visibilitychange');
 assert.equal(containsTextNode(f.tree,'fixture-rule'),false);
 const pending=f.refresh(); await Promise.resolve(); f.event('pagehide'); f.resolve(snapshot()); await pending;
 assert.equal(containsTextNode(f.tree,'fixture-rule'),false);
 assert.ok(containsTextNode(f.tree,'cleared on leaving'));
});
test('invalid and future snapshots never display rule evidence', () => {
 for (const change of [s=>s.authorization='trusted',s=>s.observedAtMs+=100000,s=>s.ttlMs=-1]) {
  const s=snapshot(); change(s); assert.equal(containsTextNode(fixture(s).tree,'fixture-rule'),false);
 }
});
