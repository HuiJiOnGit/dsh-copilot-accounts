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
	const [pathname, query] = path.split("?");
	const route = [...host.routes.values()].find((candidate) => candidate.path === pathname);
	assert.ok(route, `route ${pathname} registered`);
	const request = new Request(`http://local${pathname}${query === undefined ? "" : `?${query}`}`, {
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
		if (url.includes("/copilot_internal/user")) {
			return Response.json({
				copilot_plan: "business",
				access_type_sku: "copilot_for_business_seat_quota",
				quota_reset_date: "2026-11-01",
				quota_snapshots: {
					premium_interactions: {
						unlimited: false,
						remaining: 9751.6,
						entitlement: 10000,
						percent_remaining: 97.5,
						credits_used: 248,
						overage_permitted: true,
						has_quota: true,
					},
					chat: { unlimited: true },
					completions: { unlimited: true },
				},
			});
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

test("the host finishes a shared sign-in even when no page polls", async () => {
	stubGitHub({ login: "Shared", deviceToken: OTHER });
	const home = await newHome();
	const credentials = makeCredentials(grant(TOKEN));
	const host = makeHost(credentials, home);
	await tick();

	// Start the flow, then never call login/status: the host timer must settle it,
	// because the link is meant to be handed to someone else after the page closes.
	const started = await call(host, "/api/copilot-accounts/login/start", "POST", {});
	assert.equal(started.value.state, "pending");

	await new Promise((resolve) => setTimeout(resolve, 2600));
	assert.equal(credentials.snapshot().record.payload.refresh, OTHER);

	const listed = await call(host, "/api/copilot-accounts/list");
	assert.equal(listed.value.login.state, "done");
});

test("exports a single account on request", async () => {
	stubGitHub();
	const home = await newHome();
	const host = makeHost(makeCredentials(grant(TOKEN)), home);
	await tick();
	await call(host, "/api/copilot-accounts/import", "POST", { text: JSON.stringify({ refresh: OTHER }) });

	const list = await call(host, "/api/copilot-accounts/list");
	const other = list.value.accounts.find((account) => !account.current);

	const one = await call(host, "/api/copilot-accounts/export", "POST", { id: other.id });
	assert.equal(one.ok, true);
	assert.equal(one.value.accounts.length, 1);
	assert.equal(one.value.accounts[0].refresh, OTHER);

	const missing = await call(host, "/api/copilot-accounts/export", "POST", { id: "0000000000000000" });
	assert.equal(missing.ok, false);
});

test("reports premium-interaction quota per account and caches it", async () => {
	const calls = stubGitHub();
	const home = await newHome();
	const host = makeHost(makeCredentials(grant(TOKEN)), home);
	await tick();
	await call(host, "/api/copilot-accounts/import", "POST", { text: JSON.stringify({ refresh: OTHER }) });

	const quotaCalls = () => calls.filter((url) => url.includes("/copilot_internal/user")).length;

	const first = await call(host, "/api/copilot-accounts/credits");
	assert.equal(first.ok, true);
	assert.equal(Object.keys(first.value.credits).length, 2);
	const value = Object.values(first.value.credits)[0];
	assert.equal(value.remaining, 9751.6);
	assert.equal(value.entitlement, 10000);
	assert.equal(value.percentRemaining, 97.5);
	assert.equal(value.plan, "business");
	assert.equal(value.resetDate, "2026-11-01");
	assert.equal(value.unlimited, false);

	const afterFirst = quotaCalls();
	assert.equal(afterFirst, 2);

	await call(host, "/api/copilot-accounts/credits");
	assert.equal(quotaCalls(), afterFirst, "a cached read must not hit GitHub again");

	await call(host, "/api/copilot-accounts/credits?force=1");
	assert.equal(quotaCalls(), afterFirst + 2);

	// Switching must invalidate that account's cached quota, so the next read
	// fetches only the account that became current.
	const listed = await call(host, "/api/copilot-accounts/list");
	const target = listed.value.accounts.find((account) => !account.current);
	await call(host, "/api/copilot-accounts/use", "POST", { id: target.id });
	const beforeSwitchRead = quotaCalls();
	await call(host, "/api/copilot-accounts/credits");
	assert.equal(quotaCalls(), beforeSwitchRead + 1);
});

test("signing out clears the credential but keeps the saved account", async () => {
	stubGitHub();
	const home = await newHome();
	const credentials = makeCredentials(grant(TOKEN));
	const host = makeHost(credentials, home);
	await tick();

	const result = await call(host, "/api/copilot-accounts/logout", "POST", {});
	assert.equal(result.ok, true);

	const snapshot = credentials.snapshot();
	assert.equal(snapshot.record, undefined);
	assert.equal(snapshot.refs.has(TOKEN_REF), false);

	const listed = await call(host, "/api/copilot-accounts/list");
	assert.equal(listed.value.current, null);
	assert.equal(listed.value.accounts.length, 1);

	const command = await host.commands.get("copilot-logout").handler({});
	assert.equal(command.kind, "success");
});



