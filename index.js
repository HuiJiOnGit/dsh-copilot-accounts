/**
 * dsh-copilot-accounts — Host half.
 *
 * Owns a portable vault of GitHub Copilot accounts for the Harness Copilot
 * route. An account is exactly the pair the harness reads:
 *
 *   refs.GITHUB_COPILOT_OAUTH_TOKEN      long-lived GitHub token
 *   records["llm-pi-ai/github-copilot"]  grant record consumed by llm-pi-ai
 *
 * Switching writes those two entries through the harness credentials service,
 * so the route refreshes the short-lived Copilot token on its next request.
 * The vault is a plain JSON file under $DSH_HOME, which is what makes an
 * account portable between machines.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const name = "copilot-accounts";

/** No hard service dependency: every seam is resolved lazily. */
export const inject = [];

/** The record the harness Copilot route consumes. */
const RECORD_KEY = "llm-pi-ai/github-copilot";
/** The credential reference the Copilot route also accepts as ambient input. */
const TOKEN_REF = "GITHUB_COPILOT_OAUTH_TOKEN";

/** GitHub OAuth device flow used by the Copilot editor clients. */
const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const SCOPE = "read:user";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

/** Only tokens the Copilot API can exchange; a classic PAT is deliberately excluded. */
const TOKEN_PATTERN = /\b(?:ghu_|gho_|github_pat_)[A-Za-z0-9_]{20,}\b/g;
const CLASSIC_PAT_PATTERN = /\bghp_[A-Za-z0-9]{20,}\b/;

const PLUGIN_VERSION = "0.1.1";
const POLL_MIN_MS = 5000;
const CAPTURE_DEBOUNCE_MS = 500;

/** @returns {string} the harness home that holds credentials and the vault. */
function harnessHome() {
	const configured = process.env.DSH_HOME?.trim();
	if (configured) return configured;
	return join(homedir(), ".dsh");
}

/** Short, stable account identity derived from the long-lived token. */
function fingerprint(token) {
	return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/** The long-lived token inside a stored grant, when the record holds one. */
function grantToken(record) {
	const payload = record?.payload;
	if (payload === null || typeof payload !== "object") return undefined;
	if (payload.type !== "oauth") return undefined;
	return typeof payload.refresh === "string" && payload.refresh.length > 0 ? payload.refresh : undefined;
}

/** JSON with stable key order, used to skip no-op vault writes. */
function stableJson(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

/** Proxy-aware JSON request. Node's fetch has no env-proxy support by default. */
let proxyDispatcher;

async function resolveDispatcher() {
	if (proxyDispatcher !== undefined) return proxyDispatcher;
	const proxy =
		process.env.HTTPS_PROXY ??
		process.env.https_proxy ??
		process.env.HTTP_PROXY ??
		process.env.http_proxy ??
		process.env.ALL_PROXY ??
		process.env.all_proxy;
	if (!proxy) {
		proxyDispatcher = null;
		return null;
	}
	try {
		const { ProxyAgent } = await import("undici");
		proxyDispatcher = new ProxyAgent(proxy);
	} catch {
		proxyDispatcher = null;
	}
	return proxyDispatcher;
}

async function rawRequest(url, init, timeoutMs) {
	const dispatcher = await resolveDispatcher();
	const request = { ...init, signal: AbortSignal.timeout(timeoutMs) };
	if (dispatcher) request.dispatcher = dispatcher;
	return fetch(url, request);
}

async function readJson(response) {
	const text = await response.text();
	if (text.length === 0) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

async function githubJson(url, init = {}, timeoutMs = 20000) {
	const response = await rawRequest(
		url,
		{
			...init,
			headers: {
				accept: "application/json",
				"user-agent": `dsh-copilot-accounts/${PLUGIN_VERSION}`,
				...(init.headers ?? {}),
			},
		},
		timeoutMs,
	);
	const data = await readJson(response);
	if (!response.ok) {
		const message =
			data?.error_description ?? data?.error ?? data?.message ?? `GitHub returned HTTP ${response.status}`;
		throw new Error(message);
	}
	return data;
}

async function githubForm(url, params, timeoutMs = 20000) {
	const response = await rawRequest(
		url,
		{
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/x-www-form-urlencoded",
				"user-agent": `dsh-copilot-accounts/${PLUGIN_VERSION}`,
			},
			body: new URLSearchParams(params).toString(),
		},
		timeoutMs,
	);
	return (await readJson(response)) ?? {};
}

/** Resolve a token to its GitHub identity; failures stay non-fatal. */
async function fetchGitHubUser(token) {
	try {
		const data = await githubJson(USER_URL, { headers: { authorization: `Bearer ${token}` } }, 12000);
		if (data === undefined || typeof data.login !== "string") return undefined;
		return {
			login: data.login,
			name: typeof data.name === "string" ? data.name : undefined,
			avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : undefined,
		};
	} catch {
		return undefined;
	}
}

export function apply(ctx) {
	const vaultPath = join(harnessHome(), "copilot-accounts.json");
	const state = {
		flow: undefined,
		loginTimer: undefined,
		captureTimer: undefined,
		captureChain: Promise.resolve(),
		writeChain: Promise.resolve(),
		lastCapturedDigest: undefined,
	};

	// ── vault ────────────────────────────────────────────────────────────────

	function emptyVault() {
		return { version: 1, accounts: [] };
	}

	function normalizeVault(value) {
		const vault = emptyVault();
		const accounts = Array.isArray(value?.accounts) ? value.accounts : [];
		for (const entry of accounts) {
			if (entry === null || typeof entry !== "object") continue;
			if (typeof entry.refresh !== "string" || entry.refresh.length === 0) continue;
			vault.accounts.push({
				id: fingerprint(entry.refresh),
				login: typeof entry.login === "string" ? entry.login : undefined,
				name: typeof entry.name === "string" ? entry.name : undefined,
				avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : undefined,
				refresh: entry.refresh,
				record: entry.record !== null && typeof entry.record === "object" ? entry.record : undefined,
				source: typeof entry.source === "string" ? entry.source : undefined,
				savedAt: typeof entry.savedAt === "string" ? entry.savedAt : new Date(0).toISOString(),
				updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
				lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : undefined,
			});
		}
		return vault;
	}

	async function readVault() {
		let text;
		try {
			text = await readFile(vaultPath, "utf8");
		} catch (error) {
			if (error?.code === "ENOENT") return emptyVault();
			throw error;
		}
		try {
			return normalizeVault(JSON.parse(text));
		} catch {
			ctx.logger.warn(`${name}: ignoring an unparsable vault at ${vaultPath}`);
			return emptyVault();
		}
	}

	async function writeVault(vault) {
		await mkdir(dirname(vaultPath), { recursive: true, mode: 0o700 });
		const temp = `${vaultPath}.${randomBytes(6).toString("hex")}.tmp`;
		await writeFile(temp, `${JSON.stringify(vault, undefined, 2)}\n`, { mode: 0o600, flag: "wx" });
		await rename(temp, vaultPath);
	}

	/** Serialized read-modify-write of the vault. */
	function withVault(mutate) {
		const run = state.writeChain.then(async () => {
			const vault = await readVault();
			const result = await mutate(vault);
			await writeVault(vault);
			return result;
		});
		state.writeChain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	// ── credentials ──────────────────────────────────────────────────────────

	function credentialsService() {
		return ctx.get("credentials");
	}

	function requireCredentials() {
		const credentials = credentialsService();
		if (credentials === undefined) {
			throw new Error("the Harness credentials service is not mounted in this composition");
		}
		return credentials;
	}

	async function readCurrentRecord() {
		const credentials = credentialsService();
		if (credentials === undefined) return undefined;
		return credentials.readRecord(RECORD_KEY);
	}

	/**
	 * Snapshot whatever account the harness currently holds into the vault.
	 * Returns the account view, or undefined when no grant is stored.
	 */
	async function captureCurrent(source = "auto") {
		const record = await readCurrentRecord();
		const token = grantToken(record);
		if (token === undefined) return undefined;
		const digest = stableJson(record?.payload ?? {});
		if (source !== "manual" && digest === state.lastCapturedDigest) return undefined;

		const id = fingerprint(token);
		const existingVault = await readVault();
		const existing = existingVault.accounts.find((account) => account.id === id);
		const identity = existing?.login === undefined ? await fetchGitHubUser(token) : undefined;
		const now = new Date().toISOString();
		const account = await withVault((vault) => {
			const index = vault.accounts.findIndex((entry) => entry.id === id);
			const current = index >= 0 ? vault.accounts[index] : undefined;
			const next = {
				id,
				login: identity?.login ?? current?.login,
				name: identity?.name ?? current?.name,
				avatarUrl: identity?.avatarUrl ?? current?.avatarUrl,
				refresh: token,
				record: record === undefined ? current?.record : structuredClone(record),
				source: current?.source ?? source,
				savedAt: current?.savedAt ?? now,
				updatedAt: now,
				lastUsedAt: current?.lastUsedAt,
			};
			if (index >= 0) vault.accounts[index] = next;
			else vault.accounts.push(next);
			return next;
		});
		state.lastCapturedDigest = digest;
		return account;
	}

	function scheduleCapture(reason) {
		if (state.captureTimer !== undefined) clearTimeout(state.captureTimer);
		state.captureTimer = setTimeout(() => {
			state.captureTimer = undefined;
			state.captureChain = state.captureChain.then(() =>
				captureCurrent("auto").catch((error) => {
					ctx.logger.warn(`${name}: could not snapshot the current account (${reason})`);
					ctx.logger.warn(error);
				}),
			);
		}, CAPTURE_DEBOUNCE_MS);
	}

	// ── views ────────────────────────────────────────────────────────────────

	function accountView(account, currentToken) {
		return {
			id: account.id,
			login: account.login,
			name: account.name,
			avatarUrl: account.avatarUrl,
			models: Array.isArray(account.record?.payload?.availableModelIds)
				? account.record.payload.availableModelIds.length
				: 0,
			savedAt: account.savedAt,
			lastUsedAt: account.lastUsedAt,
			current: currentToken !== undefined && fingerprint(currentToken) === account.id,
		};
	}

	async function listView() {
		const record = await readCurrentRecord();
		const currentToken = grantToken(record);
		const vault = await readVault();
		return {
			accounts: vault.accounts
				.map((account) => accountView(account, currentToken))
				.sort((a, b) => Number(b.current) - Number(a.current)),
			current: currentToken === undefined ? null : { id: fingerprint(currentToken), models: Array.isArray(record?.payload?.availableModelIds) ? record.payload.availableModelIds.length : 0 },
			login: flowStatus(),
			vaultPath,
			credentialsPath: join(harnessHome(), ".credentials.yaml"),
			recordKey: RECORD_KEY,
			tokenRef: TOKEN_REF,
		};
	}

	// ── actions ──────────────────────────────────────────────────────────────

	async function saveCurrent() {
		const account = await captureCurrent("manual");
		if (account === undefined) throw new Error("no GitHub Copilot account is signed in right now");
		return { account: accountView(account, account.refresh), vault: await listView() };
	}

	async function useAccount(id) {
		const vault = await readVault();
		const account = vault.accounts.find((entry) => entry.id === id);
		if (account === undefined) throw new Error("that account is not in the vault");

		const credentials = requireCredentials();
		await captureCurrent("pre-switch").catch(() => undefined);

		const payload = {
			...(account.record?.payload !== null && typeof account.record?.payload === "object" ? account.record.payload : {}),
			type: "oauth",
			refresh: account.refresh,
			access: "",
			expires: 0,
		};
		const written = await credentials.modifyRecord(RECORD_KEY, async () => ({ kind: "grant", payload }));
		if (grantToken(written) !== account.refresh) {
			throw new Error("the credential write did not survive; the account was not switched");
		}
		await credentials.set(TOKEN_REF, account.refresh);

		const now = new Date().toISOString();
		await withVault((next) => {
			const entry = next.accounts.find((candidate) => candidate.id === id);
			if (entry !== undefined) entry.lastUsedAt = now;
		});
		state.lastCapturedDigest = stableJson(payload);
		return listView();
	}

	async function deleteAccount(id) {
		await withVault((vault) => {
			vault.accounts = vault.accounts.filter((account) => account.id !== id);
		});
		return listView();
	}

	function extractTokens(text) {
		const tokens = new Set();
		const trimmed = text.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				const parsed = JSON.parse(trimmed);
				const visit = (value) => {
					if (value === null || typeof value !== "object") return;
					if (typeof value.refresh === "string") tokens.add(value.refresh);
					if (typeof value.token === "string") tokens.add(value.token);
					if (typeof value.accessToken === "string") tokens.add(value.accessToken);
					if (typeof value.oauthToken === "string") tokens.add(value.oauthToken);
					if (Array.isArray(value)) for (const item of value) visit(item);
					else if (Array.isArray(value.accounts)) for (const item of value.accounts) visit(item);
				};
				visit(parsed);
			} catch {
				// fall through to the token scan
			}
		}
		if (tokens.size === 0) {
			for (const match of trimmed.matchAll(TOKEN_PATTERN)) tokens.add(match[0]);
		}
		return [...tokens].filter((token) => {
			TOKEN_PATTERN.lastIndex = 0;
			return TOKEN_PATTERN.test(token) && !CLASSIC_PAT_PATTERN.test(token);
		});
	}

	async function importText(text) {
		if (typeof text !== "string" || text.trim().length === 0) throw new Error("nothing to import");
		if (CLASSIC_PAT_PATTERN.test(text) && extractTokens(text).length === 0) {
			throw new Error("classic personal access tokens (ghp_) are not accepted by the Copilot API; use a ghu_ or gho_ token");
		}
		const tokens = extractTokens(text);
		if (tokens.length === 0) {
			throw new Error("no GitHub token found; paste a ghu_/gho_/github_pat_ token, an account card, or a DSH credentials snippet");
		}

		const imported = [];
		for (const token of tokens) {
			const identity = await fetchGitHubUser(token);
			const account = await withVault((vault) => {
				const id = fingerprint(token);
				const index = vault.accounts.findIndex((entry) => entry.id === id);
				const current = index >= 0 ? vault.accounts[index] : undefined;
				const now = new Date().toISOString();
				const next = {
					id,
					login: identity?.login ?? current?.login,
					name: identity?.name ?? current?.name,
					avatarUrl: identity?.avatarUrl ?? current?.avatarUrl,
					refresh: token,
					record: current?.record,
					source: "import",
					savedAt: current?.savedAt ?? now,
					updatedAt: now,
					lastUsedAt: current?.lastUsedAt,
				};
				if (index >= 0) vault.accounts[index] = next;
				else vault.accounts.push(next);
				return next;
			});
			imported.push(accountView(account, undefined));
		}
		return { imported, vault: await listView() };
	}

	async function exportAll() {
		const vault = await readVault();
		return {
			schema: "dsh-copilot-accounts",
			version: 1,
			exportedAt: new Date().toISOString(),
			accounts: vault.accounts.map((account) => ({
				login: account.login,
				name: account.name,
				refresh: account.refresh,
				record: account.record,
			})),
		};
	}

	// ── device flow ──────────────────────────────────────────────────────────

	function flowStatus() {
		const flow = state.flow;
		if (flow === undefined) return { state: "idle" };
		return {
			state: flow.state,
			userCode: flow.userCode,
			verificationUri: flow.verificationUri,
			expiresAt: flow.expiresAt,
			error: flow.error,
			account: flow.account,
		};
	}

	async function startLogin() {
		if (state.flow !== undefined && state.flow.state === "pending") return flowStatus();
		const data = await githubForm(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPE }, 20000);
		if (typeof data.device_code !== "string" || typeof data.user_code !== "string") {
			throw new Error(data.error_description ?? "GitHub did not return a device code");
		}
		state.flow = {
			deviceCode: data.device_code,
			userCode: data.user_code,
			verificationUri: data.verification_uri ?? "https://github.com/login/device",
			expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
			interval: Math.max(POLL_MIN_MS, (Number(data.interval) || 5) * 1000),
			lastPollAt: 0,
			state: "pending",
			polling: false,
		};
		// Poll here rather than only while a settings page is open: the link is
		// meant to be handed to someone else, and this process must finish the
		// sign-in after the page that started it is closed.
		ensureLoginPolling();
		return flowStatus();
	}

	/** Keep polling the device flow on the host until it settles. */
	function ensureLoginPolling() {
		if (state.loginTimer !== undefined) return;
		state.loginTimer = setInterval(() => {
			void pollLogin().catch(() => undefined);
		}, 2000);
		state.loginTimer.unref?.();
	}

	function stopLoginPolling() {
		if (state.loginTimer === undefined) return;
		clearInterval(state.loginTimer);
		state.loginTimer = undefined;
	}

	async function pollLogin() {
		const flow = state.flow;
		if (flow === undefined) return { state: "idle" };
		if (flow.state !== "pending") {
			stopLoginPolling();
			return flowStatus();
		}
		if (Date.now() > flow.expiresAt) {
			flow.state = "expired";
			stopLoginPolling();
			return flowStatus();
		}
		if (flow.polling || Date.now() - flow.lastPollAt < flow.interval) return flowStatus();

		flow.polling = true;
		flow.lastPollAt = Date.now();
		try {
			const data = await githubForm(
				ACCESS_TOKEN_URL,
				{
					client_id: CLIENT_ID,
					device_code: flow.deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				},
				20000,
			);
			if (typeof data.access_token === "string" && data.access_token.length > 0) {
				await completeLogin(data.access_token);
			} else if (data.error === "authorization_pending") {
				// keep waiting
			} else if (data.error === "slow_down") {
				flow.interval += POLL_MIN_MS;
			} else if (data.error === "expired_token") {
				flow.state = "expired";
			} else if (data.error === "access_denied") {
				flow.state = "denied";
			} else if (data.error !== undefined) {
				flow.state = "error";
				flow.error = data.error_description ?? data.error;
			}
		} catch (error) {
			flow.state = "error";
			flow.error = error instanceof Error ? error.message : String(error);
		} finally {
			flow.polling = false;
		}
		if (flow.state !== "pending") stopLoginPolling();
		return flowStatus();
	}

	async function completeLogin(token) {
		const flow = state.flow;
		try {
			await captureCurrent("before-login").catch(() => undefined);
			const credentials = requireCredentials();
			const payload = { type: "oauth", refresh: token, access: "", expires: 0 };
			const written = await credentials.modifyRecord(RECORD_KEY, async () => ({ kind: "grant", payload }));
			if (grantToken(written) !== token) throw new Error("the credential write did not survive");
			await credentials.set(TOKEN_REF, token);
			const account = await captureCurrent("login");
			state.lastCapturedDigest = stableJson(payload);
			flow.state = "done";
			flow.account = account === undefined ? undefined : accountView(account, token);
		} catch (error) {
			flow.state = "error";
			flow.error = error instanceof Error ? error.message : String(error);
		}
	}

	function cancelLogin() {
		state.flow = undefined;
		stopLoginPolling();
		return { state: "idle" };
	}

	// ── wiring ───────────────────────────────────────────────────────────────

	ctx.inject(["credentials"], (credentialCtx) => {
		credentialCtx.effect(
			() => {
				void captureCurrent("startup").catch((error) => {
					ctx.logger.warn(`${name}: initial capture failed`);
					ctx.logger.warn(error);
				});
				const offRecord = credentialCtx.on("credentials/record-updated", (key) => {
					if (key === RECORD_KEY) scheduleCapture("record-updated");
				});
				const offRef = credentialCtx.on("credentials/reference-updated", (ref) => {
					if (ref === TOKEN_REF) scheduleCapture("reference-updated");
				});
				// Fallback for a composition that does not deliver those events: one
				// cheap read per minute still captures a sign-in done by another plugin.
				const poll = setInterval(() => {
					void captureCurrent("poll").catch(() => undefined);
				}, 60_000);
				poll.unref?.();
				return () => {
					offRecord?.();
					offRef?.();
					clearInterval(poll);
					stopLoginPolling();
					if (state.captureTimer !== undefined) clearTimeout(state.captureTimer);
				};
			},
			`${name}: automatic account capture`,
		);
	});

	const json = (status, body) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
		});

	const action = (handler) => async (request) => {
		try {
			let body;
			if (request.method === "POST") {
				body = await request.json().catch(() => undefined);
			}
			return json(200, { ok: true, value: await handler(body) });
		} catch (error) {
			return json(200, { ok: false, error: error instanceof Error ? error.message : String(error) });
		}
	};

	ctx.inject(["connection"], (connectionCtx) => {
		connectionCtx.effect(() => {
			const register = (path, methods, handler) =>
				connectionCtx.connection.fetch.register({ path, methods, requestBody: "buffered", fetch: handler });
			const disposers = [
				register("/api/copilot-accounts/list", ["GET"], action(() => listView())),
				register("/api/copilot-accounts/save", ["POST"], action(() => saveCurrent())),
				register("/api/copilot-accounts/use", ["POST"], action((body) => useAccount(String(body?.id ?? "")))),
				register("/api/copilot-accounts/delete", ["POST"], action((body) => deleteAccount(String(body?.id ?? "")))),
				register("/api/copilot-accounts/import", ["POST"], action((body) => importText(String(body?.text ?? "")))),
				register("/api/copilot-accounts/export", ["GET"], action(() => exportAll())),
				register("/api/copilot-accounts/login/start", ["POST"], action(() => startLogin())),
				register("/api/copilot-accounts/login/status", ["GET"], action(() => pollLogin())),
				register("/api/copilot-accounts/login/cancel", ["POST"], action(() => cancelLogin())),
			];
			return async () => {
				for (const dispose of disposers.reverse()) await dispose();
			};
		}, `${name}: settings API`);
	});

	ctx.inject(["commands"], (commandCtx) => {
		const register = (definition) => commandCtx.commands.register(definition);
		commandCtx.effect(() => {
			const disposers = [
				register({
					name: "copilot-accounts",
					description: "List saved GitHub Copilot accounts and show which one is active",
					handler: async () => {
						const view = await listView();
						if (view.accounts.length === 0) {
							return { kind: "success", text: "No saved Copilot accounts yet. Open Settings → Copilot Accounts to add one." };
						}
						const lines = view.accounts.map(
							(account, index) =>
								`${index + 1}. ${account.login ?? "unknown"}${account.name ? ` (${account.name})` : ""}${account.current ? "  ← active" : ""}${account.models ? `  ${account.models} models` : ""}`,
						);
						return {
							kind: "success",
							text: [`Saved Copilot accounts (${view.accounts.length}):`, ...lines].join("\n"),
						};
					},
				}),
				register({
					name: "copilot-use",
					description: "Switch the Harness Copilot route to a saved account by login name or list number",
					handler: async (invocation) => {
						const query = String(invocation?.rawInput ?? "").trim();
						if (query.length === 0) return { kind: "error", text: "Usage: /copilot-use <login | number>" };
						const view = await listView();
						const byNumber = /^\d+$/.test(query) ? view.accounts[Number(query) - 1] : undefined;
						const target =
							byNumber ??
							view.accounts.find((account) => account.login?.toLowerCase() === query.toLowerCase()) ??
							view.accounts.find((account) => account.id === query);
						if (target === undefined) return { kind: "error", text: `No saved account matches "${query}".` };
						await useAccount(target.id);
						return { kind: "success", text: `Switched to ${target.login ?? target.id}. The next Copilot request refreshes its token.` };
					},
				}),
				register({
					name: "copilot-save",
					description: "Save the currently signed-in Copilot account into the portable vault",
					handler: async () => {
						const result = await saveCurrent();
						const login = result.account.login ?? result.account.id;
						return { kind: "success", text: `Saved ${login} (${result.account.models} models).` };
					},
				}),
			];
			return () => {
				for (const dispose of disposers.reverse()) dispose();
			};
		}, `${name}: slash commands`);
	});
}
