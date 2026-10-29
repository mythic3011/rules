import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { normalizeProfileSpec, solveSubconverterPlan, runtimeData } from '../worker/solver.mjs';
import { renderIni } from '../worker/render.mjs';
import { convertInput } from '../worker/converter.mjs';

const providers = [
  { url: 'https://rules.example.test/domains.yaml', behavior: 'domain', target: 'reject' },
  { url: 'https://rules.example.test/classical.yaml', behavior: 'classical', target: 'proxy' },
];
const spec = { baseProfile: 'ai-balanced', adblock: true, customRuleProviders: providers };

test('custom provider boundary rejects unsafe links, unknown fields and conflicting direct routes', () => {
  for (const url of ['http://example.test/rules', 'https://user:secret@example.test/rules', 'https://example.test/rules#fragment', 'https://example.test/rules\nunsafe']) {
    assert.throws(() => normalizeProfileSpec({ ...spec, customRuleProviders: [{ ...providers[0], url }] }));
  }
  assert.throws(() => normalizeProfileSpec({ ...spec, customRuleProviders: Array(11).fill(providers[0]) }));
  assert.throws(() => normalizeProfileSpec({ ...spec, customRuleProviders: [{ ...providers[0], inject: true }] }));
  assert.throws(() => normalizeProfileSpec({ ...spec, allowDirect: false, customRuleProviders: [{ ...providers[0], target: 'direct' }] }));
  assert.equal(normalizeProfileSpec(spec).customRuleProviders.length, 2);
});

test('multiple INI providers preserve ordering, privacy guards and a terminal FINAL', () => {
  const { plan } = solveSubconverterPlan(spec);
  const lines = renderIni(plan, runtimeData, { language: 'en', spec }).split('\n');
  const positions = providers.map(provider => lines.findIndex(line => line.startsWith('ruleset=') && line.includes(provider.url)));
  assert.ok(positions[0] >= 0 && positions[1] > positions[0]);
  assert.ok(lines.findIndex(line => line.includes('Privacy_Guard_Classical')) < positions[0]);
  const rules = lines.filter(line => line.startsWith('ruleset='));
  assert.match(rules.at(-1), /FINAL/);
  assert.ok(lines.some(line => line.includes('Ads_Lite_Domain')));
});

test('YAML provider definitions survive all three generated comment languages unchanged', async () => {
  const parsed = [];
  const comments = [];
  for (const language of ['en', 'zh-Hant', 'zh-Hans']) {
    const result = await convertInput({ input: 'socks5://proxy.example.test:1080#Test', spec: { ...spec, language } });
    const config = YAML.parse(result.yaml);
    parsed.push(config);
    comments.push(result.yaml.split('\n').filter(line => line.startsWith('#')).join('\n'));
    for (const provider of providers) assert.ok(Object.values(config['rule-providers']).some(entry => entry.url === provider.url));
    assert.match(config.rules.at(-1), /^MATCH,/);
  }
  assert.deepEqual(parsed[0], parsed[1]);
  assert.deepEqual(parsed[1], parsed[2]);
  assert.equal(new Set(comments).size, 3);
});
