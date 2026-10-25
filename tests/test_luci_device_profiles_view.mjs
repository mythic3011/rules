import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { containsTextNode, evaluateLuCIView, makeEFixture, makeTranslator } from "./luci_view_fixture.mjs";

const viewSource = readFileSync(new URL("../apps/luci-app-openclash-guard/htdocs/luci-static/resources/view/openclash-guard/devices.js", import.meta.url), "utf8");

function makeLuCIFixture() {
	const { E, scalarHtmlContexts } = makeEFixture();
	const _ = makeTranslator();
	const sectionIds = ["__proto__", "constructor"];
	const manualLabels = Object.create(null);
	manualLabels["__proto__"] = '<img id="manual-label" src=x onerror="manual()">';
	manualLabels.constructor = "Work laptop";

	const form = {
		GridSection: "GridSection",
		DummyValue: "DummyValue",
		Value: "Value",
		ListValue: "ListValue",
		MultiValue: "MultiValue",
		Map: function() {
			const options = [];
			const section = {
				cfgsections: () => sectionIds,
				option: function(type, key, title) {
					const option = {
						type,
						key,
						title,
						values: [],
						value: function(value, label) {
							this.values.push({ value, label });
						},
						formvalue: sectionId => manualLabels[sectionId]
					};
					options.push(option);
					return option;
				}
			};

			this.section = () => section;
			this.render = () => {
				const controls = options.map(option => {
					if (option.type === form.DummyValue)
						return E("div", {}, sectionIds.map(sectionId => E("code", {}, [ option.cfgvalue(sectionId) ])));
					if (option.values.length)
						return E("select", {}, option.values.map(choice => E("option", { value: choice.value }, [ choice.label ])));
					return E("label", {}, [ option.title ]);
				});
				return Promise.resolve(E("form", {}, controls));
			};
		}
	};

	const view = { extend: definition => definition };
	const rpc = { declare: () => () => Promise.resolve({}) };
	const component = evaluateLuCIView(viewSource, { view, form, rpc, _, E });
	return { component, E, scalarHtmlContexts };
}

test("device view renders untrusted labels and DTO strings only as text nodes", async () => {
	const fixture = makeLuCIFixture();
	const malicious = {
		manual: '<img id="manual-label" src=x onerror="manual()">',
		role: '<svg id="role-label" onload="role()">',
		kind: '<img id="kind-label" src=x onerror="kind()">',
		profile: '</option><script id="profile-label">profile()</script>',
		platform: '<img id="platform" src=x onerror="platform()">',
		reason: '</li><script id="reason">reason()</script>',
		confidence: '<svg id="confidence" onload="confidence()">',
		staleRole: '<script id="stale-role">stale()</script>'
	};
	const catalog = {
		version: 1,
		roles: [ { id: "__proto__", label: malicious.role }, { id: "constructor", label: "Communication" } ],
		profiles: [ { id: "ini:ai-balanced", label: malicious.profile }, { id: "yaml:ai-balanced", label: "AI Balanced (YAML)" } ],
		kinds: [ { id: "desktop", label: malicious.kind } ],
		limits: { maxDevices: 128, maxLabelLength: 64, maxRoles: 6, deviceIdPattern: "^[A-Za-z0-9_]{1,64}$" }
	};
	const devices = [
		{
			id: "__proto__",
			fresh: true,
			observation: {
				observed_at_ms: 1_760_000_000_000,
				expires_at_ms: 1_760_000_060_000,
				platform: malicious.platform,
				collection: { status: "partial", reason: malicious.reason },
				role_suggestions: [ { role: "__proto__", confidence: malicious.confidence, active_bucket_count: 2 } ]
			}
		},
		{
			id: "constructor",
			fresh: false,
			observation: null,
			role_suggestions: [ { role: "constructor", label: malicious.staleRole } ]
		}
	];

	const tree = await fixture.component.render([ catalog, { version: 1, devices } ]);
	assert.deepEqual(fixture.scalarHtmlContexts, [], "the view must never send a scalar child to LuCI's innerHTML path");
	for (const value of Object.values(malicious).filter(value => value !== malicious.staleRole))
		assert.equal(containsTextNode(tree, value), true, `expected text node for ${value}`);
	assert.equal(containsTextNode(tree, malicious.staleRole), false, "stale suggestions must remain hidden");
});
