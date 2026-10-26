import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	containsTextNode,
	evaluateLuCIView,
	installStringFormat,
	makeEFixture,
	makeTranslator
} from "./luci_view_fixture.mjs";

const VIEW_ROOT = new URL("../apps/luci-app-openclash-guard/htdocs/luci-static/resources/view/openclash-guard/", import.meta.url);
const overviewSource = readFileSync(new URL("overview.js", VIEW_ROOT), "utf8");
const profileSource = readFileSync(new URL("profile.js", VIEW_ROOT), "utf8");
const testsSource = readFileSync(new URL("tests.js", VIEW_ROOT), "utf8");

function makeRpc(replyByMethod) {
	return {
		declare: function(spec) {
			return function() {
				const reply = replyByMethod[spec.method];
				return Promise.resolve(typeof reply === "function" ? reply() : reply || {});
			};
		}
	};
}

function makeForm(E, formValues) {
	const options = [];
	const form = {
		TypedSection: "TypedSection",
		Value: "Value",
		ListValue: "ListValue",
		Flag: "Flag",
		Button: "Button",
		Map: function() {
			const section = {
				option: function(type, key, title) {
					const option = {
						type,
						key,
						title,
						values: [],
						value: function(value, label) { this.values.push({ value, label }); },
						depends: function() {},
						formvalue: function() { return formValues[key] || ""; }
					};
					options.push(option);
					return option;
				}
			};
			this.section = () => section;
			this.render = () => Promise.resolve(E("form", {}, []));
		}
	};
	return { form, options };
}

function assertTextOnly(fixture, tree, values) {
	for (const value of values) {
		assert.equal(containsTextNode(tree, value), true, `expected a text node containing ${value}`);
		assert.equal(
			fixture.scalarHtmlContexts.some(context => context.value.includes(value)),
			false,
			`untrusted value reached E() innerHTML context: ${value}`
		);
	}
}

test("Overview keeps profile configuration and probe history out of E innerHTML", () => {
	const fixture = makeEFixture();
	const _ = makeTranslator();
	const view = { extend: definition => definition };
	const rpc = makeRpc({});
	const L = { url: value => value };
	const component = evaluateLuCIView(overviewSource, { view, rpc, _, E: fixture.E, L });
	const malicious = {
		profileUrl: '<img id="profile-url" src=x onerror="profile()">',
		profileMode: '<svg id="profile-mode" onload="mode()">',
		distribution: '<img id="distribution" src=x onerror="distribution()">',
		dnsBackend: '<svg id="dns-backend" onload="dns()">',
		directRegion: '</div><script id="direct-region">direct()</script>',
		proxyRegion: '</div><img id="proxy-region" src=x onerror="proxy()">',
		service: '<img id="history-service" src=x onerror="service()">',
		country: '<img id="country" src=x onerror="country()">',
		colo: '<svg id="colo" onload="colo()">',
		ip: '<img id="ip" src=x onerror="ip()">',
		error: '<img id="trace-error" src=x onerror="error()">',
		expectedMode: '<svg id="expected-mode" onload="expected()">',
		expectedRegion: '<img id="expected-region" src=x onerror="region()">'
	};
	const now = Math.floor(Date.now() / 1000);
	const status = {
		adguardHomeRunning: false,
		dnsBackend: malicious.dnsBackend,
		guardInstalled: true,
		configEnabled: true,
		failClosed: true,
		autoRefresh: true,
		openclashRunning: true,
		resolverSync: false,
		directRegion: malicious.directRegion,
		proxyRegion: malicious.proxyRegion,
		chatgptMode: "proxy",
		claudeMode: "proxy",
		grokMode: "proxy",
		profileMode: malicious.profileMode,
		profileUrl: malicious.profileUrl,
		distributionSource: malicious.distribution
	};
	const records = [
		{
			epoch: now,
			service: "chatgpt",
			ok: true,
			country: malicious.country,
			colo: malicious.colo,
			ip: malicious.ip,
			expectedMode: malicious.expectedMode,
			expectedRegion: malicious.expectedRegion
		},
		{
			epoch: now - 1,
			service: malicious.service,
			ok: false,
			error: malicious.error,
			expectedMode: malicious.expectedMode,
			expectedRegion: malicious.expectedRegion
		}
	];
	const tree = component.render([ status, { regions: [] }, { records } ]);

	assertTextOnly(fixture, tree, [
		malicious.profileUrl,
		malicious.profileMode,
		malicious.distribution,
		malicious.dnsBackend,
		malicious.directRegion.toUpperCase(),
		malicious.proxyRegion.toUpperCase(),
		malicious.service,
		malicious.country,
		malicious.colo,
		malicious.ip,
		malicious.error,
		malicious.expectedMode,
		malicious.expectedRegion.toUpperCase()
	]);
});

test("Profile probe error and fetched INI section are text in notifications", async () => {
	const fixture = makeEFixture();
	const _ = makeTranslator();
	const view = { extend: definition => definition };
	const malicious = {
		url: 'https://example.test/<img id="uci-profile-url" src=x onerror="url()">',
		firstSection: '</p><img id="first-section" src=x onerror="section()">',
		error: '<svg id="probe-error" onload="error()">'
	};
	const replies = [
		{ ok: true, looksLikeIni: true, bytes: 128, sections: 2, firstSection: malicious.firstSection },
		{ ok: false, error: malicious.error }
	];
	const rpc = makeRpc({ probeProfile: () => replies.shift() });
	const notifications = [];
	const ui = { addNotification: (title, element) => notifications.push(element) };
	const { form, options } = makeForm(fixture.E, { profile_url: malicious.url });
	const component = evaluateLuCIView(profileSource, { view, form, rpc, _, E: fixture.E, ui });
	await component.render();
	const probe = options.find(option => option.key === "_probe");
	assert.ok(probe && typeof probe.onclick === "function");

	const restoreFormat = installStringFormat();
	try {
		await probe.onclick("core");
		await probe.onclick("core");
	}
	finally {
		restoreFormat();
	}

	assert.equal(notifications.length, 2);
	assertTextOnly(fixture, notifications[0], [ malicious.firstSection ]);
	assertTextOnly(fixture, notifications[1], [ malicious.error ]);
});

test("Tests page renders untrusted trace and history fields as text nodes", () => {
	const fixture = makeEFixture();
	const _ = makeTranslator();
	const view = { extend: definition => definition };
	const rpc = makeRpc({});
	const ui = { createHandlerFn: (context, handler) => handler };
	const window = { location: { reload: () => {} } };
	const component = evaluateLuCIView(testsSource, { view, rpc, _, E: fixture.E, ui, window });
	const malicious = {
		service: '<img id="trace-service" src=x onerror="service()">',
		country: '<svg id="trace-country" onload="country()">',
		colo: '<img id="trace-colo" src=x onerror="colo()">',
		ip: '<svg id="trace-ip" onload="ip()">',
		error: '<img id="history-error" src=x onerror="error()">',
		expectedMode: '<svg id="history-mode" onload="mode()">',
		expectedRegion: '<img id="history-region" src=x onerror="region()">'
	};
	const now = Math.floor(Date.now() / 1000);
	const records = [
		{
			epoch: now,
			service: "chatgpt",
			ok: true,
			country: malicious.country,
			colo: malicious.colo,
			ip: malicious.ip,
			expectedMode: malicious.expectedMode,
			expectedRegion: malicious.expectedRegion
		},
		{
			epoch: now - 1,
			service: malicious.service,
			ok: false,
			error: malicious.error,
			expectedMode: malicious.expectedMode,
			expectedRegion: malicious.expectedRegion
		}
	];
	const tree = component.render([ { regions: [] }, { records } ]);

	assertTextOnly(fixture, tree, [
		malicious.service,
		malicious.country,
		malicious.colo,
		malicious.ip,
		malicious.error,
		malicious.expectedMode,
		malicious.expectedRegion.toUpperCase()
	]);
});
