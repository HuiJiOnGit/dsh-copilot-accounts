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
- **Upload** — paste a token, an account card, or a credential snippet copied from another DSH.
- **Export all** — move every account to another machine with one JSON file.

## Install

Requires a working DSH with `@lujianjun19/dsh-llm-github-copilot` (the sign-in UI and `/copilot-login`). This plugin manages accounts; that one performs sign-in.

```sh
dsh plugin --profile web add github:HuiJiOnGit/dsh-copilot-accounts
# or from a local checkout
dsh plugin --profile web add /absolute/path/to/dsh-copilot-accounts
```

Restart DSH, then open **Settings → Copilot Accounts**.

## Usage

| Button | Effect |
|---|---|
| **Save current** | Stores the signed-in account (usually automatic) |
| **Add account** | GitHub device flow; the current account is saved first and stays signed in |
| **Upload account** | Paste a token / account card / credential snippet, or pick a file |
| **Export all** | Downloads every account as JSON |

Slash commands: `/copilot-accounts`, `/copilot-use <login|index>`, `/copilot-save`.

## Sharing an account

1. On the machine that is signed in: **Export all** → `copilot-accounts-*.json`.
2. Send that file (or its content).
3. On the target machine: **Upload account** → paste or pick the file.

A bare `ghu_` / `gho_` / `github_pat_` token also works: the plugin builds the grant record for you. Classic `ghp_` PATs are rejected by the Copilot API and by this plugin.

The vault lives at `%USERPROFILE%\.dsh\copilot-accounts.json` (or `~/.dsh/...`, following `DSH_HOME`), mode `0600`, plaintext tokens — treat it like `~/.dsh/.credentials.yaml`.

## Switching semantics

The plugin writes the target account's long-lived token to both credential entries and blanks `access`/`expires`. On the next Copilot request, `llm-pi-ai` exchanges the refresh token for a short-lived Copilot token and rebuilds the account's model list. No restart needed.

## Limitations

- The first sign-in for any account still needs the GitHub device flow (once).
- The `github-copilot` model list in `cordis.patch.yml` is static and account-independent.
- The credential-record shape is an internal convention of `@deepseek-ai/dsh-llm-pi-ai`; a future DSH release may change it. The plugin fails loudly instead of corrupting credentials.

## License

MIT
