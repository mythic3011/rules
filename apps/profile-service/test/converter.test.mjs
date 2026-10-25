import assert from "node:assert/strict";
import test from "node:test";
import YAML from "yaml";

import { convertInput, parseSubscriptionContent } from "../worker/converter.mjs";

const baseProfile = {
  "proxy-providers": {
    provider1: {
      type: "http",
      url: "https://private.example/sub?token=template-secret",
      path: "./providers/template.yaml",
      header: { Authorization: "template-secret" },
      filter: "US|United States",
      "exclude-filter": "expired",
      override: { "skip-cert-verify": true, udp: true },
    },
  },
  "proxy-groups": [{ name: "manual", type: "select", use: ["provider1"] }],
  rules: ["MATCH,reject"],
};

test("converts socks5h credentials to an inline Mihomo provider without template overrides", async () => {
  const result = await convertInput({
    input: "socks5h://user%40example:p%3Ass@proxy.example:1080#US%20Node",
    format: "proxy",
    profile: baseProfile,
  });
  const config = YAML.parse(result.yaml);
  assert.equal(result.nodeCount, 1);
  assert.deepEqual(config["proxy-providers"].provider1, {
    filter: "US|United States",
    "exclude-filter": "expired",
    type: "inline",
    payload: [{
      name: "US Node",
      type: "socks5",
      server: "proxy.example",
      port: 1080,
      username: "user@example",
      password: "p:ss",
      udp: false,
    }],
  });
  assert.equal(config["proxy-groups"][0].use[0], "provider1");
  assert.match(result.yaml, /MATCH,reject/u);
  assert.doesNotMatch(result.yaml, /template-secret|template\.yaml|skip-cert-verify/u);
});

test("converts a TLS HTTPS proxy link and percent-encoded credentials", async () => {
  const result = await convertInput({
    input: "https://alice%40home:p%40ss@proxy.example:443#secure",
    profile: baseProfile,
  });
  const node = YAML.parse(result.yaml)["proxy-providers"].provider1.payload[0];
  assert.equal(node.type, "http");
  assert.equal(node.tls, true);
  assert.equal(node.username, "alice@home");
  assert.equal(node.password, "p@ss");
});

test("uses the selected language for the explanatory YAML comment header", async () => {
  const result = await convertInput({
    input: "socks5h://node.example:1080#Main",
    profile: baseProfile,
    spec: { language: "zh-Hant" },
  });
  assert.match(result.yaml, /^# 由 Profile Builder 產生/u);
  assert.equal(YAML.parse(result.yaml)["proxy-providers"].provider1.type, "inline");
});

test("single proxy mode applies the same per-node length limit as subscription input", async () => {
  await assert.rejects(
    convertInput({
      input: `socks5://proxy.example:1080#${"n".repeat(8_193)}`,
      format: "proxy",
      profile: baseProfile,
    }),
    (error) => error.code === "node_too_large" && error.status === 413,
  );
});

test("converts standard VMess and Shadowsocks subscription links", () => {
  const vmess = `vmess://${btoa(JSON.stringify({
    v: "2",
    ps: "Japan WS",
    add: "vmess.example",
    port: "443",
    id: "01234567-89ab-cdef-0123-456789abcdef",
    aid: "0",
    scy: "auto",
    net: "ws",
    host: "cdn.example",
    path: "/v2ray",
    tls: "tls",
    sni: "cdn.example",
  }))}`;
  const ssCredential = btoa("aes-256-gcm:p@ss");
  const content = `${vmess}\nss://${ssCredential}@ss.example:8388#Singapore`;
  const nodes = parseSubscriptionContent(content);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, "vmess");
  assert.deepEqual(nodes[0]["ws-opts"], {
    path: "/v2ray",
    headers: { Host: "cdn.example" },
  });
  assert.equal(nodes[0].tls, true);
  assert.equal(nodes[1].type, "ss");
  assert.equal(nodes[1].password, "p@ss");
  assert.equal(nodes[1].name, "Singapore");
});

test("parses VLESS Reality links and preserves supported security fields", () => {
  const [node] = parseSubscriptionContent(
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example:443?security=reality&pbk=public-key&sid=abcd&sni=cdn.example&fp=chrome&type=tcp#Reality",
  );
  assert.equal(node.type, "vless");
  assert.equal(node.tls, true);
  assert.deepEqual(node["reality-opts"], { "public-key": "public-key", "short-id": "abcd" });
  assert.equal(node.servername, "cdn.example");
  assert.equal(node["client-fingerprint"], "chrome");
});

test("converts Trojan, Hysteria2, and TUIC links while retaining explicit transport options", () => {
  const nodes = parseSubscriptionContent([
    "trojan://trojan-password@trojan.example:443?sni=cdn.example&allowInsecure=false#Trojan",
    "hysteria2://hy2-password@hy2.example:443?sni=hy2.example&obfs=salamander&obfs-password=mask#HY2",
    "tuic://01234567-89ab-cdef-0123-456789abcdef:tuic-password@tuic.example:443?congestion_control=bbr&udp_relay_mode=native&reduce_rtt=true#TUIC",
  ].join("\n"));
  assert.deepEqual(nodes.map((node) => node.type), ["trojan", "hysteria2", "tuic"]);
  assert.equal(nodes[0].sni, "cdn.example");
  assert.equal(nodes[0]["skip-cert-verify"], undefined);
  assert.equal(nodes[1].obfs, "salamander");
  assert.equal(nodes[1]["obfs-password"], "mask");
  assert.equal(nodes[2]["congestion-controller"], "bbr");
  assert.equal(nodes[2]["udp-relay-mode"], "native");
  assert.equal(nodes[2]["reduce-rtt"], true);
});

test("accepts equal URI aliases and rejects conflicting aliases or unsupported protocol values", () => {
  const [trojan] = parseSubscriptionContent(
    "trojan://password@trojan.example:443?sni=cdn.example&peer=cdn.example&type=grpc&path=GunService&serviceName=GunService#Trojan",
  );
  assert.equal(trojan.sni, "cdn.example");
  assert.equal(trojan["grpc-opts"]["grpc-service-name"], "GunService");

  const [vless] = parseSubscriptionContent(
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example:443?security=tls&type=grpc&path=GunService&serviceName=GunService#VLESS",
  );
  assert.equal(vless["grpc-opts"]["grpc-service-name"], "GunService");

  for (const input of [
    "trojan://password@trojan.example:443?sni=one.example&peer=two.example",
    "trojan://password@trojan.example:443?type=grpc&path=one&serviceName=two",
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example:443?type=grpc&path=one&serviceName=two",
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example:443?flow=unsupported",
    "tuic://01234567-89ab-cdef-0123-456789abcdef:password@tuic.example:443?congestion_control=unsupported",
    "tuic://01234567-89ab-cdef-0123-456789abcdef:password@tuic.example:443?udp_relay_mode=unsupported",
  ]) {
    assert.throws(
      () => parseSubscriptionContent(input),
      (error) => ["conflicting_node_options", "unsupported_node_option"].includes(error.code),
    );
  }
});

test("parses Clash YAML payloads and gives duplicate node names stable unique names", () => {
  const nodes = parseSubscriptionContent(`proxies:
  - name: shared
    type: socks5
    server: proxy-a.example
    port: 1080
    username: alice
    password: secret
  - name: shared
    type: http
    server: proxy-b.example
    port: 8080
`);
  assert.deepEqual(nodes.map((node) => node.name), ["shared", "shared (2)"]);
  assert.equal(nodes[0].password, "secret");
});

test("renames node collisions with built-ins and canonical policy names deterministically", async () => {
  const profile = {
    ...baseProfile,
    proxies: [{ name: "fixed-proxy", type: "socks5", server: "fixed.example", port: 1080 }],
    "proxy-groups": [{ name: "📌 固定節點", type: "select" }, { name: "manual", type: "select" }],
    "rule-providers": { "policy-rules": { type: "inline", behavior: "classical", payload: [] } },
  };
  const input = [
    "http://one.example:8080#A",
    "http://two.example:8080#A",
    "http://three.example:8080#A%20(2)",
    "http://direct.example:8080#DIRECT",
    "http://reject.example:8080#REJECT",
    "http://group.example:8080#%F0%9F%93%8C%20%E5%9B%BA%E5%AE%9A%E7%AF%80%E9%BB%9E",
    "http://manual.example:8080#manual",
    "http://fixed.example:8080#fixed-proxy",
    "http://provider.example:8080#provider1",
    "http://rules.example:8080#policy-rules",
  ].join("\n");
  const result = await convertInput({ input, profile });
  const names = YAML.parse(result.yaml)["proxy-providers"].provider1.payload.map((node) => node.name);
  assert.deepEqual(names, [
    "A",
    "A (2)",
    "A (2) (2)",
    "DIRECT (2)",
    "REJECT (2)",
    "📌 固定節點 (2)",
    "manual (2)",
    "fixed-proxy (2)",
    "provider1 (2)",
    "policy-rules (2)",
  ]);
});

test("decodes Base64 URI subscriptions and rejects unsupported options without echoing input", () => {
  const encoded = btoa("trojan://private-password@node.example:443?sni=node.example#Main");
  const [node] = parseSubscriptionContent(encoded);
  assert.equal(node.type, "trojan");

  assert.throws(
    () => parseSubscriptionContent("socks5h://user:secret@proxy.example:1080?plugin=unsafe"),
    (error) => {
      assert.equal(error.code, "unsupported_node_option");
      assert.doesNotMatch(error.message, /secret|proxy\.example/u);
      return true;
    },
  );
});

test("bounds node count and rejects YAML without a proxies list", () => {
  assert.throws(
    () => parseSubscriptionContent("proxies:\nproxy-groups: []\n"),
    (error) => error.code === "invalid_clash_yaml",
  );
  const tooMany = Array.from({ length: 101 }, (_, index) => `socks5://node-${index}.example:1080`).join("\n");
  assert.throws(
    () => parseSubscriptionContent(tooMany),
    (error) => error.code === "too_many_nodes",
  );
});

test("fetches subscriptions only from exact approved HTTPS hosts and rejects redirects", async () => {
  let observed;
  const fetcher = async (url, options) => {
    observed = { url, options };
    return new Response("socks5h://node.example:1080#Main", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  };
  const result = await convertInput({
    input: "https://feeds.example.net/sub?token=private",
    format: "subscription",
    env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,backup.example.net" },
    fetcher,
    profile: baseProfile,
  });
  assert.equal(result.nodeCount, 1);
  assert.equal(observed.options.redirect, "manual");
  assert.equal(observed.options.method, "GET");
  assert.equal(new URL(observed.url).hostname, "feeds.example.net");

  await assert.rejects(
    convertInput({
      input: "https://not-approved.example.net/sub?token=private",
      format: "subscription",
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net" },
      fetcher,
      profile: baseProfile,
    }),
    (error) => error.code === "subscription_host_not_allowed",
  );

  await assert.rejects(
    convertInput({
      input: "https://feeds.example.net/redirect",
      format: "subscription",
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net" },
      fetcher: async () => new Response(null, { status: 302, headers: { location: "https://other.example/" } }),
      profile: baseProfile,
    }),
    (error) => error.code === "subscription_redirect_rejected",
  );
});

test("combines mixed proxy links and multiple approved subscriptions into one YAML result", async () => {
  const fetchedHosts = [];
  const fetcher = async (url, options) => {
    const hostname = new URL(url).hostname;
    fetchedHosts.push(hostname);
    assert.equal(options.redirect, "manual");
    const content = hostname === "feeds.example.net"
      ? `ss://${btoa("aes-256-gcm:remote-one")}@ss.example.net:8388#Shared`
      : "trojan://remote-two@trojan.example.net:443#Shared";
    return new Response(content, { status: 200 });
  };
  const input = [
    "socks5h://local-user:local-pass@socks.example.net:1080#Shared",
    "https://edge.example.net:443#Shared",
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example.net:443?security=tls#Shared",
    "https://feeds.example.net/primary?token=synthetic-one",
    "https://backup.example.net/secondary?token=synthetic-two",
  ].join("\n");
  const result = await convertInput({
    input,
    format: "auto",
    env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,backup.example.net" },
    fetcher,
    profile: baseProfile,
  });
  const config = YAML.parse(result.yaml);
  const nodes = config["proxy-providers"].provider1.payload;
  assert.equal(result.nodeCount, 5);
  assert.deepEqual(fetchedHosts, ["feeds.example.net", "backup.example.net"]);
  assert.deepEqual(nodes.map((node) => node.type), ["socks5", "http", "vless", "ss", "trojan"]);
  assert.deepEqual(nodes.map((node) => node.name), [
    "Shared",
    "Shared (2)",
    "Shared (3)",
    "Shared (4)",
    "Shared (5)",
  ]);
});

test("subscription mode fetches every explicit-port URL without a path", async () => {
  const fetchedHosts = [];
  const result = await convertInput({
    input: "https://feeds.example.net:443\nhttps://backup.example.net:443",
    format: "subscription",
    env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,backup.example.net" },
    fetcher: async (url) => {
      const hostname = new URL(url).hostname;
      fetchedHosts.push(hostname);
      return new Response(`socks5h://${hostname}:1080#${hostname}`, { status: 200 });
    },
    profile: baseProfile,
  });
  assert.equal(result.nodeCount, 2);
  assert.deepEqual(fetchedHosts, ["feeds.example.net", "backup.example.net"]);
});

test("validates every top-level remote before fetching and returns no partial conversion", async () => {
  let fetchCount = 0;
  await assert.rejects(
    convertInput({
      input: [
        "socks5h://local.example.net:1080#Local",
        "https://feeds.example.net/approved",
        "https://denied.example.net/not-approved",
      ].join("\n"),
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net" },
      fetcher: async () => {
        fetchCount += 1;
        return new Response("socks5h://remote.example.net:1080#Remote");
      },
      profile: baseProfile,
    }),
    (error) => error.code === "subscription_host_not_allowed",
  );
  assert.equal(fetchCount, 0);
});

test("caps explicit remote URLs before any fetch and aggregates downloaded bytes", async () => {
  const hosts = Array.from({ length: 6 }, (_, index) => `feed-${index + 1}.example.net`);
  let fetchCount = 0;
  await assert.rejects(
    convertInput({
      input: hosts.map((host) => `https://${host}/sub`).join("\n"),
      env: { CONVERTER_SUBSCRIPTION_HOSTS: hosts.join(",") },
      fetcher: async () => {
        fetchCount += 1;
        return new Response("socks5h://node.example.net:1080#Node");
      },
      profile: baseProfile,
    }),
    (error) => error.code === "too_many_subscriptions" && error.status === 413,
  );
  assert.equal(fetchCount, 0);

  const largeYaml = `#${"x".repeat(140_000)}\nproxies:\n  - name: remote\n    type: socks5\n    server: remote.example.net\n    port: 1080\n`;
  await assert.rejects(
    convertInput({
      input: "https://feeds.example.net/one\nhttps://backup.example.net/two",
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,backup.example.net" },
      fetcher: async () => new Response(largeYaml, { status: 200 }),
      profile: baseProfile,
    }),
    (error) => error.code === "subscription_too_large" && error.status === 413,
  );
});

test("enforces the 100-node maximum across direct and downloaded inputs", async () => {
  const directNodes = Array.from(
    { length: 100 },
    (_, index) => `socks5h://local-${index}.example.net:1080#Local-${index}`,
  );
  let fetchCount = 0;
  await assert.rejects(
    convertInput({
      input: [...directNodes, "https://feeds.example.net/one"].join("\n"),
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net" },
      fetcher: async () => {
        fetchCount += 1;
        return new Response("socks5h://remote.example.net:1080#Remote");
      },
      profile: baseProfile,
    }),
    (error) => error.code === "too_many_nodes" && error.status === 413,
  );
  assert.equal(fetchCount, 1);
});

test("does not recursively fetch URLs found in a downloaded subscription", async () => {
  let fetchCount = 0;
  await assert.rejects(
    convertInput({
      input: "https://feeds.example.net/list",
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,nested.example.net" },
      fetcher: async () => {
        fetchCount += 1;
        return new Response("https://nested.example.net/list");
      },
      profile: baseProfile,
    }),
    (error) => error.code === "unsupported_node_option",
  );
  assert.equal(fetchCount, 1);
});

test("invalid non-empty host allowlist settings fail with a sanitized configuration error", async () => {
  await assert.rejects(
    convertInput({
      input: "https://feeds.example.net/sub",
      format: "subscription",
      env: { CONVERTER_SUBSCRIPTION_HOSTS: "feeds.example.net,https://secret.example.net" },
      fetcher: async () => { throw new Error("must not fetch"); },
      profile: baseProfile,
    }),
    (error) => {
      assert.equal(error.code, "converter_configuration_invalid");
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /secret|feeds\.example/u);
      return true;
    },
  );
});
