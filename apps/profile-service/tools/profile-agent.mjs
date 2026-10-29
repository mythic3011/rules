#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 300_000;
const REQUEST_TIMEOUT_MS = 30_000;

function usage() {
  return "Usage: node tools/profile-agent.mjs --base-url URL <catalog|resolve|create|get|update> [profile-id] [json-file|-]";
}

async function readBounded(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) {
      stream.destroy();
      throw new Error("JSON input exceeds 300000 bytes");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(source) {
  let text;
  try {
    text = await readBounded(source === "-" ? process.stdin : createReadStream(source));
  } catch (error) {
    if (error instanceof Error && error.message === "JSON input exceeds 300000 bytes") throw error;
    throw new Error("JSON input could not be read");
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON input must be an object");
    }
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("JSON input is malformed");
    throw error;
  }
}

function parseArgs(args) {
  let baseUrl;
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--base-url") {
      baseUrl = args[index + 1];
      index += 1;
    } else {
      positional.push(args[index]);
    }
  }
  if (!baseUrl) throw new Error(`Missing --base-url. ${usage()}`);
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("--base-url must be a valid HTTP(S) URL");
  }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw new Error("--base-url must be an HTTP(S) origin or path without credentials, query, or fragment");
  }
  const [command, ...rest] = positional;
  if (!command) throw new Error(usage());
  return { baseUrl: url.href.replace(/\/$/, ""), command, rest };
}

async function request(baseUrl, path, { method = "GET", body, manageToken } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (manageToken) headers.authorization = `Bearer ${manageToken}`;
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Profile service request failed");
  }
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Profile service returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const code = typeof result?.error === "string" && /^[a-z0-9_]{1,64}$/.test(result.error)
      ? result.error
      : "request_failed";
    throw new Error(`Profile service rejected the request (HTTP ${response.status}, ${code})`);
  }
  return result;
}

export async function run(args, { env = process.env, stdin } = {}) {
  const { baseUrl, command, rest } = parseArgs(args);
  if (command === "catalog") {
    if (rest.length) throw new Error(usage());
    return request(baseUrl, "/api/v1/catalog");
  }
  if (command === "resolve" || command === "create") {
    if (rest.length > 1) throw new Error(usage());
    const input = await (stdin && rest[0] === "-" ? stdin() : readJson(rest[0] ?? "-"));
    const path = command === "resolve" ? "/api/v1/resolve" : "/api/v1/profiles";
    return request(baseUrl, path, { method: "POST", body: input });
  }
  if (command === "get" || command === "update") {
    const [id, source] = rest;
    if (!id || (command === "get" ? rest.length !== 1 : rest.length > 2)) throw new Error(usage());
    const token = env.PROFILE_MANAGE_TOKEN;
    if (!token) throw new Error("Set PROFILE_MANAGE_TOKEN in the environment");
    const path = `/api/v1/profiles/${encodeURIComponent(id)}`;
    if (command === "get") return request(baseUrl, path, { manageToken: token });
    const input = await (stdin && source === "-" ? stdin() : readJson(source ?? "-"));
    return request(baseUrl, path, { method: "PUT", body: input, manageToken: token });
  }
  throw new Error(`Unknown command. ${usage()}`);
}

async function main() {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile agent command failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
