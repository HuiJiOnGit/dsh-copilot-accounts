/**
 * Host-half integration tests: no network, no real credentials.
 *
 * Each test builds a mock Cordis context, captures the routes the plugin
 * registers, and drives them with real `Request` objects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { apply } from "../index.js";

const RECORD_KEY = "llm-pi-ai/github-copilot";
const TOKEN_REF = "GITHUB_COPILOT_OAUTH_TOKEN";
const TOKEN = `ghu_${"a".repeat(36)}`;
const OTHER = `ghu_${"b".repeat(36)}`;

function grant(token, extra = {}) {
	return { kind: "grant", payload: { type: "oauth", refresh: token, access: "", expires: 0, ...extra } };
}

function makeCredentials(initialRecord) {
	let record = initialRecord;
	const refs = new Map();
	return {
		reads: 0,
		async readRecord(key) {
			this.reads += 1;
			return key === RECORD_KEY ? record : undefined;
		},
		async modifyRecord(key, mutate) {
			assert.equal(key, RECORD_KEY);
			record = await mutate(record);
			return record;
		},
		async deleteRecord() {
			record = undefined;
		},
		async set(ref, value) {
			refs.set(ref, value);
		},
		async unset(ref) {
			refs.delete(ref);
		},
		async resolve(ref) {
			const value = refs.get(ref);
			return value === undefined ? undefined : { value, source: "file" };
		},
		snapshot() {
			return { record, refs: new Map(refs) };
		},
	};
}

function makeHost(credentials, home) {
	process.env.DSH_HOME = home;
	const routes = new Map();
	const commands = new Map();
	const logger = { warn() {}, info() {}, error() {} };
	const connection = {
		fetch: {
			register(route) {
				routes.set(`${route.path} ${route.methods.join(",")}`, route);
				return async () => {};
			},
		},
	};
	const commandService = {
		register(definition) {
			commands.set(definition.name, definition);
			return () => {};
		},
	};
	const child = {
		logger,
		get(key) {
			return key === "credentials" ? credentials : undefined;
		},
		on() {
			return () => {};
		},
		effect(activate) {
			const dispose = activate();
			return () => {
				if (typeof dispose === "function") dispose();
			};
		},
		connection,
		commands: commandService,
	};
	const ctx = {
		...child,
		inject(_deps, callback) {
			return callback(child);
		},
	};
	apply(ctx);
	return { routes, commands };
}

async function call(host, path, method = "GET", body) {
	const route = [...host.routes.values()].find((candidate) => candidate.path === path);
	assert.ok(route, `route ${path} registered`);
	const request = new Request(`http://local${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const response = await route.fetch(request);
	return response.json();
}

function stubGitHub({ login = "Tester", name = "Test User", deviceToken = TOKEN } = {}) {
	const calls = [];
	globalThis.fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input.url;
		calls.push(url);
		if (url.includes("/login/device/code")) {
			return Response.json({
				device_code: "device-code",
				user_code: "ABCD-1234",
				verification_uri: "https://github.com/login/device",
				expires_in: 900,
				interval: 5,
			});
		}
		if (url.includes("/login/oauth/access_token")) {
			return Response.json({ access_token: deviceToken, token_type: "bearer", scope: "read:user" });
		}
		if (url.includes("api.github.com/user")) {
			return Response.json({ login, name });
		}
		throw new Error(`unexpected request ${url}`);
	};
	return calls;
}

async function newHome() {
	return mkdtemp(join(tmpdir(), "copilot-accounts-test-"));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 40));

test("captures the signed-in account on startup", async () => {
	stubGitHub();
	const home = await newHome();
	const credentials = makeCredentials(grant(TOKEN, { availableModelIds: ["m1", "m2"] }));
	const host = makeHost(credentials, home);
	await tick();

	const vault = JSON.parse(await readFile(join(home, "copilot-accounts.json"), "utf8"));
	assert.equal(vault.accounts.length, 1);
	assert.equal(vault.accounts[0].login, "Tester");
	assert.equal(vault.accounts[0].refresh, TOKEN);

	const listed = await call(host, "/api/copilot-accounts/list");
	assert.equal(listed.ok, true);
	assert.equal(listed.value.accounts.length, 1);
	assert.equal(listed.value.accounts[0].current, true);
	assert.equal(listed.value.accounts[0].models, 2);
});

test("switch blanks the cached access token and rewrites both credential slots", async () => {
	stubGitHub();
	const home = await newHome();
	const credentials = makeCredentials(grant(OTHER));
	const host = makeHost(credentials, home);
	await tick();

	const imported = await call(host, "/api/copilot-accounts/import", "POST", { text: JSON.stringify({ refresh: TOKEN }) });
	assert.equal(imported.ok, true);
	assert.equal(imported.value.imported.length, 1);
	const account = imported.value.vault.accounts.find((entry) => entry.refresh === undefined && entry.current === false);
	assert.ok(account);

	const switched = await call(host, "/api/copilot-accounts/use", "POST", { id: account.id });
	assert.equal(switched.ok, true);

	const snapshot = credentials.snapshot();
	assert.equal(snapshot.record.payload.refresh, TOKEN);
	assert.equal(snapshot.record.payload.access, "");
	assert.equal(snapshot.record.payload.expires, 0);
	assert.equal(snapshot.refs.get(TOKEN_REF), TOKEN);
	assert.equal(switched.value.current.id, account.id);
});

test("import accepts a DSH credentials snippet and rejects classic PATs", async () => {
	stubGitHub({ login: "FromYaml" });
	const home = await newHome();
	const host = makeHost(makeCredentials(undefined), home);

	const snippet = `refs:\n  GITHUB_COPILOT_OAUTH_TOKEN: ${TOKEN}\nrecords:\n  llm-pi-ai/github-copilot:\n    kind: grant\n    payload:\n      refresh: ${TOKEN}\n`;
	const imported = await call(host, "/api/copilot-accounts/import", "POST", { text: snippet });
	assert.equal(imported.ok, true);
	assert.equal(imported.value.imported.length, 1);
	assert.equal(imported.value.imported[0].login, "FromYaml");

	const classic = await call(host, "/api/copilot-accounts/import", "POST", { text: `ghp_${"c".repeat(36)}` });
	assert.equal(classic.ok, false);
	assert.match(classic.error, /ghp_/);

	const empty = await call(host, "/api/copilot-accounts/import", "POST", { text: "nothing here" });
	assert.equal(empty.ok, false);
});

test("export round-trips accounts and delete removes one", async () => {
	stubGitHub();
	const home = await newHome();
	const host = makeHost(makeCredentials(grant(TOKEN)), home);
	await tick();
	await call(host, "/api/copilot-accounts/import", "POST", { text: JSON.stringify({ refresh: OTHER }) });

	const exported = await call(host, "/api/copilot-accounts/export");
	assert.equal(exported.ok, true);
	assert.equal(exported.value.accounts.length, 2);
	const tokens = exported.value.accounts.map((entry) => entry.refresh).sort();
	assert.deepEqual(tokens, [OTHER, TOKEN].sort());

	const listed = await call(host, "/api/copilot-accounts/list");
	const target = listed.value.accounts.find((entry) => !entry.current);
	const afterDelete = await call(host, "/api/copilot-accounts/delete", "POST", { id: target.id });
	assert.equal(afterDelete.ok, true);
	assert.equal(afterDelete.value.accounts.length, 1);
});

test("save captures a refresh the route performed after a switch", async () => {
	stubGitHub();
	const home = await newHome();
	const credentials = makeCredentials(grant(TOKEN));
	const host = makeHost(credentials, home);
	await tick();

	// Simulate the route writing a fresh short-lived token back into the record.
	const before = credentials.snapshot().record;
	await credentials.modifyRecord(RECORD_KEY, async () => ({
		kind: "grant",
		payload: { ...before.payload, access: "copilot-short-lived", expires: Date.now() + 1_500_000 },
	}));

	const saved = await call(host, "/api/copilot-accounts/save", "POST", {});
	assert.equal(saved.ok, true);
	const vault = JSON.parse(await readFile(join(home, "copilot-accounts.json"), "utf8"));
	assert.equal(vault.accounts[0].record.payload.access, "copilot-short-lived");
});

test("device flow signs in a new account without touching the previous one", async () => {
	stubGitHub({ login: "Second", deviceToken: OTHER });
	const home = await newHome();
	const credentials = makeCredentials(grant(TOKEN));
	const host = makeHost(credentials, home);
	await tick();

	const started = await call(host, "/api/copilot-accounts/login/start", "POST", {});
	assert.equal(started.ok, true);
	assert.equal(started.value.userCode, "ABCD-1234");

	const status = await call(host, "/api/copilot-accounts/login/status");
	assert.equal(status.ok, true);
	assert.equal(status.value.state, "done");

	const snapshot = credentials.snapshot();
	assert.equal(snapshot.record.payload.refresh, OTHER);
	assert.equal(snapshot.refs.get(TOKEN_REF), OTHER);

	const vault = JSON.parse(await readFile(join(home, "copilot-accounts.json"), "utf8"));
	const tokens = vault.accounts.map((entry) => entry.refresh).sort();
	assert.deepEqual(tokens, [OTHER, TOKEN].sort());

	const listed = await call(host, "/api/copilot-accounts/list");
	assert.equal(listed.value.accounts.length, 2);
	assert.equal(listed.value.accounts.find((entry) => entry.current).id.length, 16);
});

test("slash commands list and switch accounts", async () => {
	stubGitHub();
	const home = await newHome();
	const host = makeHost(makeCredentials(grant(TOKEN)), home);
	await tick();
	await call(host, "/api/copilot-accounts/import", "POST", { text: JSON.stringify({ refresh: OTHER }) });

	const list = await host.commands.get("copilot-accounts").handler({});
	assert.equal(list.kind, "success");
	assert.match(list.text, /2/);

	const use = await host.commands.get("copilot-use").handler({ rawInput: "2" });
	assert.equal(use.kind, "success");

	const missing = await host.commands.get("copilot-use").handler({ rawInput: "nobody" });
	assert.equal(missing.kind, "error");
});
