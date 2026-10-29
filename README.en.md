# dsh-copilot-accounts

**Multi-account manager for GitHub Copilot in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).** Save, switch, import, and export Copilot credentials — one click to change accounts, no browser round-trip.

[中文](README.md)

## What it does

The Harness Copilot route reads exactly one credential pair:

```
refs.GITHUB_COPILOT_OAUTH_TOKEN
records["llm-pi-ai/github-copilot"]
```

This plugin keeps a portable vault of accounts for that pair:

- **One-click switch** — the next message uses the selected account.
- **Automatic save** — every sign-in, token refresh, or external credential edit is snapshotted; the previous account is never lost.
- **Quota at a glance** — each card shows the remaining Copilot premium requests and reset date, with a refresh button.
- **Export** — export every account, or just one.
- **Sign out** — clears the DSH credential while keeping the account saved.
- **Upload** — paste a token, an account card, or a credential snippet copied from another DSH (experimental; see below).

## Install

Standalone: this plugin runs the GitHub device flow itself and only needs the `llm-pi-ai` Copilot route that ships with DSH. It does **not** require `@lujianjun19/dsh-llm-github-copilot`; if that plugin is installed too, both coexist.

```sh
dsh plugin --profile web add github:HuiJiOnGit/dsh-copilot-accounts
# or from a local checkout
dsh plugin --profile web add /absolute/path/to/dsh-copilot-accounts
```

Restart DSH, then open **Settings → Copilot Accounts**.

### Replacing `@lujianjun19/dsh-llm-github-copilot`

This plugin covers it: share sign-in replaces `/copilot-login`, the account list replaces `/copilot-status`, and `/copilot-logout` is included. Once this plugin works, the old one can be removed. Both may stay installed without conflict.

`dsh plugin` only forwards to pnpm and does **not** update the profile's `dsh.profile.bundles`. Remove the old plugin from Settings → Plugins, or remove the dependency and delete `@lujianjun19/dsh-llm-github-copilot` from that array by hand:

```sh
dsh plugin --profile desktop remove @lujianjun19/dsh-llm-github-copilot
```

Then restart DSH. Keep the `dsh-copilot-accounts` bundle entry.

## Usage

The settings page is one panel with three inline sections — no dialogs:

| Section | Content |
|---|---|
| Active / saved accounts | Active account card with its quota, **Save current**, **Refresh quota**, **Export all**, **Sign out**, plus per-account **Export** / **Switch** / **Delete** |
| Add / share sign-in | **Generate sign-in link**; the code, the shareable text, copy buttons, and the waiting state appear in the same section |
| Upload account | Paste box, **Import**, **Choose a file**, and an expandable guide to the accepted sources (**not field-tested**; prefer the share link) |

Slash commands: `/copilot-accounts`, `/copilot-use <login|index>`, `/copilot-save`, `/copilot-logout`.

### Share a sign-in link

1. **Add / share sign-in** → **Generate sign-in link**.
2. **Copy invite** and send it to the other person (or copy just the link).
3. They open `https://github.com/login/device`, enter the code, and authorize.
4. The account is added and switched here automatically. Leaving the page does not cancel the wait.

## Uploading an account

> ⚠️ **Not field-tested.** This path is covered by tests for its formats, but has not been run end-to-end between real accounts. Prefer the share sign-in link above; if an upload fails, ask for a fresh share link.

Three things are accepted:

| Source | What it is | Where it lives |
|---|---|---|
| Account card | `copilot-accounts-<date>.json`, or one account's `copilot-account-<login>-<date>.json` | Downloaded from **Export all** / a card's **Export** button |
| DSH credentials file | The two entries below, or the whole file | `C:\Users\<name>\.dsh\.credentials.yaml` on Windows, `~/.dsh/.credentials.yaml` elsewhere |
| A long-lived token | `ghu_…` (`gho_`, `github_pat_` also work) | The `refs.GITHUB_COPILOT_OAUTH_TOKEN` value in that file |

The two entries, when copying by hand:

```yaml
refs:
  GITHUB_COPILOT_OAUTH_TOKEN: ghu_xxx

records:
  llm-pi-ai/github-copilot:
    kind: grant
    payload:
      type: oauth
      refresh: ghu_xxx
```

Only `ghu_` / `gho_` / `github_pat_` tokens are extracted; other provider keys in the file are ignored. Classic `ghp_` PATs are rejected by the Copilot API and by this plugin.

The vault lives at `%USERPROFILE%\.dsh\copilot-accounts.json` (or `~/.dsh/...`, following `DSH_HOME`), mode `0600`, plaintext tokens — treat it like `~/.dsh/.credentials.yaml`. Both paths are shown at the bottom of the settings page.

## Switching semantics

The plugin writes the target account's long-lived token to both credential entries and blanks `access`/`expires`. On the next Copilot request, `llm-pi-ai` exchanges the refresh token for a short-lived Copilot token and rebuilds the account's model list. No restart needed.

## Quota (premium requests)

Each card shows the account's remaining Copilot premium requests, for example `Remaining 9751.6 / 10000 · used 248 · resets 2026-11-01`. **Refresh quota** forces a new read; switching to an account or signing one in clears that account's cached value and refetches it immediately, and otherwise results are cached for 10 minutes.

The data comes from the endpoint the Copilot editor clients use:

```
GET https://api.github.com/copilot_internal/user
Authorization: Bearer <the account's long-lived token>
Copilot-Integration-Id: vscode-chat
```

`quota_snapshots.premium_interactions` carries `remaining` / `entitlement` / `percent_remaining` / `credits_used`; `quota_reset_date` is the reset date and `copilot_plan` the plan. This is an **undocumented endpoint**: GitHub may change or restrict it. Failures are tolerated — a card then shows “Quota unavailable” and everything else keeps working.

## Limitations

- The first sign-in for any account still needs the GitHub device flow (once).
- The `github-copilot` model list in `cordis.patch.yml` is static and account-independent.
- The credential-record shape is an internal convention of `@deepseek-ai/dsh-llm-pi-ai`; a future DSH release may change it. The plugin fails loudly instead of corrupting credentials.

## License

MIT
