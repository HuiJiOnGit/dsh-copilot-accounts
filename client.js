/**
 * dsh-copilot-accounts — Client half.
 *
 * One Settings page: the active account, the saved accounts, one-click
 * switching, device-flow sign-in for a new account, and import/export of
 * portable account cards.
 */
window.__ModuleLoader__.load({
  id: "dsh-copilot-accounts",
  factory(require) {
    const React = require("react");
    const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
    const { Button, Modal } = require("@deepseek-ai/dsh-client-ui-primitives");
    const { useEffect, useRef, useState } = React;

    const API = "/api/copilot-accounts";
    const LANG = (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";

    const STRINGS = {
      zh: {
        nav: "Copilot 账号",
        title: "GitHub Copilot 账号",
        intro: "保存多个已登录的 Copilot 账号，点一下即可切换。切换只改 DSH 的凭据，不会退出 GitHub。",
        loading: "加载中…",
        current: "当前使用",
        none: "当前没有已登录的 Copilot 账号。",
        signedOutHint: "可以添加账号，或上传一份别人已登录的凭据。",
        saved: "已保存的账号",
        empty: "还没有保存过账号。登录一个账号后会自动保存。",
        saveCurrent: "保存当前账号",
        addAccount: "添加账号",
        upload: "上传账号",
        exportAll: "导出全部",
        switch: "切换",
        remove: "删除",
        switching: "切换中…",
        saving: "保存中…",
        models: "个模型",
        lastUsed: "上次使用",
        savedAt: "保存于",
        currentBadge: "当前",
        loginTitle: "登录新的 Copilot 账号",
        loginDesc: "在浏览器里打开 GitHub 并输入下面的代码。当前账号会先自动保存，不会被退出。",
        code: "设备代码",
        openGitHub: "打开 GitHub 授权页",
        waiting: "等待授权…",
        loginDone: "已登录并保存新账号。",
        retry: "重试",
        close: "关闭",
        cancel: "取消",
        importTitle: "上传账号",
        importDesc: "粘贴 token、账号卡片，或从另一台 DSH 复制的凭据片段；也可以选择文件。",
        importPlaceholder: "粘贴 ghu_ / gho_ / github_pat_ token，或 {\"accounts\":[…]} 账号卡片",
        importAction: "导入",
        importing: "导入中…",
        chooseFile: "选择文件…",
        importHint: "支持：账号卡片 JSON、DSH 的 .credentials.yaml 片段、纯 token。ghp_ 经典 PAT 不可用。",
        imported: "已导入 {n} 个账号。",
        exported: "已导出全部账号。",
        savedCurrent: "已保存当前账号。",
        switched: "已切换，下一条消息会自动换用新账号的 token。",
        deleted: "已删除该账号。",
        error: "出错了：{message}",
        vault: "账号文件",
        security: "账号文件里是明文 token，请只放在自己的电脑上。",
      },
      en: {
        nav: "Copilot Accounts",
        title: "GitHub Copilot Accounts",
        intro: "Keep several signed-in Copilot accounts and switch with one click. Switching only rewrites DSH credentials; it never signs you out of GitHub.",
        loading: "Loading…",
        current: "Active",
        none: "No Copilot account is signed in right now.",
        signedOutHint: "Add an account, or upload credentials someone else is already signed in with.",
        saved: "Saved accounts",
        empty: "Nothing saved yet. Signing in saves the account automatically.",
        saveCurrent: "Save current",
        addAccount: "Add account",
        upload: "Upload account",
        exportAll: "Export all",
        switch: "Switch",
        remove: "Delete",
        switching: "Switching…",
        saving: "Saving…",
        models: "models",
        lastUsed: "Last used",
        savedAt: "Saved",
        currentBadge: "active",
        loginTitle: "Sign in a new Copilot account",
        loginDesc: "Open GitHub in your browser and enter the code below. The current account is saved first and stays signed in.",
        code: "Device code",
        openGitHub: "Open GitHub",
        waiting: "Waiting for authorization…",
        loginDone: "Signed in and saved.",
        retry: "Retry",
        close: "Close",
        cancel: "Cancel",
        importTitle: "Upload account",
        importDesc: "Paste a token, an account card, or a credential snippet copied from another DSH; or pick a file.",
        importPlaceholder: "ghu_ / gho_ / github_pat_ token, or {\"accounts\":[…]} card",
        importAction: "Import",
        importing: "Importing…",
        chooseFile: "Choose a file…",
        importHint: "Accepts account-card JSON, a DSH .credentials.yaml snippet, or a bare token. Classic ghp_ PATs are rejected.",
        imported: "Imported {n} account(s).",
        exported: "Exported every account.",
        savedCurrent: "Current account saved.",
        switched: "Switched. The next message uses the new account's token.",
        deleted: "Account deleted.",
        error: "Something failed: {message}",
        vault: "Account file",
        security: "The account file holds plaintext tokens; keep it on your own machine.",
      },
    };

    function t(key, params) {
      const text = STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
      if (params === undefined) return text;
      return text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
    }

    const css = {
      page: { display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0 24px" },
      header: { display: "flex", flexDirection: "column", gap: "6px" },
      title: { fontSize: "18px", fontWeight: 600, margin: 0 },
      intro: { margin: 0, opacity: 0.72, fontSize: "13px", lineHeight: 1.5 },
      actions: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" },
      section: { display: "flex", flexDirection: "column", gap: "10px" },
      sectionTitle: { fontSize: "13px", fontWeight: 600, opacity: 0.8, margin: 0 },
      card: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px",
        borderRadius: "10px",
        border: "1px solid rgba(127,127,127,0.28)",
        background: "rgba(127,127,127,0.05)",
      },
      cardCurrent: { borderColor: "rgba(45,164,78,0.55)", background: "rgba(45,164,78,0.08)" },
      avatar: {
        width: "38px",
        height: "38px",
        flex: "0 0 38px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "16px",
        color: "#fff",
        background: "#2da44e",
        userSelect: "none",
      },
      body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" },
      login: { display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px" },
      badge: {
        fontSize: "11px",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: "999px",
        color: "#2da44e",
        border: "1px solid rgba(45,164,78,0.5)",
      },
      meta: { fontSize: "12px", opacity: 0.62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      rowActions: { display: "flex", gap: "6px", flex: "0 0 auto" },
      notice: { fontSize: "12px", color: "#2da44e" },
      error: { fontSize: "12px", color: "#d1242f", whiteSpace: "pre-wrap" },
      modalBody: { display: "flex", flexDirection: "column", gap: "12px" },
      textarea: {
        width: "100%",
        minHeight: "140px",
        resize: "vertical",
        padding: "10px",
        borderRadius: "8px",
        border: "1px solid rgba(127,127,127,0.35)",
        background: "transparent",
        color: "inherit",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "12px",
        lineHeight: 1.5,
        boxSizing: "border-box",
      },
      hint: { fontSize: "12px", opacity: 0.66, lineHeight: 1.5 },
      link: {
        border: "none",
        background: "none",
        padding: 0,
        color: "#0969da",
        cursor: "pointer",
        fontSize: "12px",
        textDecoration: "underline",
      },
      code: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "22px",
        letterSpacing: "4px",
        fontWeight: 700,
        padding: "12px 16px",
        borderRadius: "10px",
        border: "1px dashed rgba(127,127,127,0.5)",
        textAlign: "center",
        userSelect: "all",
      },
      footer: { fontSize: "11px", opacity: 0.5, lineHeight: 1.5, wordBreak: "break-all" },
    };

    async function call(path, init) {
      const response = await fetch(`${API}/${path}`, {
        headers: { "content-type": "application/json" },
        ...init,
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      if (data === undefined) throw new Error(`HTTP ${response.status}`);
      if (data.ok !== true) throw new Error(data.error ?? "request failed");
      return data.value;
    }

    function initial(account) {
      const source = account.login ?? account.id ?? "?";
      return source.slice(0, 1).toUpperCase();
    }

    function formatTime(iso) {
      if (typeof iso !== "string") return undefined;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toLocaleString();
    }

    function download(name, text) {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function AccountCard({ account, busy, onUse, onDelete }) {
      const metaParts = [];
      if (account.name) metaParts.push(account.name);
      if (account.models) metaParts.push(`${account.models} ${t("models")}`);
      const lastUsed = formatTime(account.lastUsedAt);
      if (lastUsed) metaParts.push(`${t("lastUsed")} ${lastUsed}`);
      return jsxs("div", {
        style: { ...css.card, ...(account.current ? css.cardCurrent : {}) },
        children: [
          jsx("div", { style: css.avatar, "aria-hidden": true, children: initial(account) }),
          jsxs("div", {
            style: css.body,
            children: [
              jsxs("div", {
                style: css.login,
                children: [
                  jsx("span", { children: account.login ?? account.id }),
                  account.current ? jsx("span", { style: css.badge, children: t("currentBadge") }) : null,
                ].filter(Boolean),
              }),
              jsx("div", { style: css.meta, children: metaParts.join(" · ") || account.id }),
            ],
          }),
          jsxs("div", {
            style: css.rowActions,
            children: [
              account.current
                ? null
                : jsx(Button, {
                    variant: "primary",
                    size: "sm",
                    disabled: busy,
                    onClick: () => onUse(account),
                    children: busy ? t("switching") : t("switch"),
                  }),
              jsx(Button, {
                variant: "outline",
                size: "sm",
                disabled: busy,
                onClick: () => onDelete(account),
                children: t("remove"),
              }),
            ].filter(Boolean),
          }),
        ],
      });
    }

    function SettingsPage() {
      const [view, setView] = useState(null);
      const [busy, setBusy] = useState("");
      const [notice, setNotice] = useState("");
      const [error, setError] = useState("");
      const [importOpen, setImportOpen] = useState(false);
      const [importText, setImportText] = useState("");
      const [loginOpen, setLoginOpen] = useState(false);
      const [flow, setFlow] = useState({ state: "idle" });
      const fileRef = useRef(null);

      const run = async (label, task) => {
        setBusy(label);
        setError("");
        setNotice("");
        try {
          return await task();
        } catch (failure) {
          setError(t("error", { message: failure instanceof Error ? failure.message : String(failure) }));
          return undefined;
        } finally {
          setBusy("");
        }
      };

      const refresh = async () => {
        try {
          setView(await call("list"));
        } catch (failure) {
          setError(t("error", { message: failure instanceof Error ? failure.message : String(failure) }));
        }
      };

      useEffect(() => {
        void refresh();
      }, []);

      useEffect(() => {
        if (!loginOpen || flow.state !== "pending") return undefined;
        const timer = setInterval(async () => {
          try {
            const next = await call("login/status");
            setFlow(next);
            if (next.state === "done") {
              setNotice(t("loginDone"));
              await refresh();
            }
          } catch {
            // transient poll failure: keep the dialog open
          }
        }, 2000);
        return () => clearInterval(timer);
      }, [loginOpen, flow.state]);

      const saveCurrent = () =>
        run("save", async () => {
          await call("save", { method: "POST", body: "{}" });
          setNotice(t("savedCurrent"));
          await refresh();
        });

      const useAccount = (account) =>
        run("use", async () => {
          setView(await call("use", { method: "POST", body: JSON.stringify({ id: account.id }) }));
          setNotice(t("switched"));
        });

      const deleteAccount = (account) =>
        run("delete", async () => {
          setView(await call("delete", { method: "POST", body: JSON.stringify({ id: account.id }) }));
          setNotice(t("deleted"));
        });

      const exportAll = () =>
        run("export", async () => {
          const value = await call("export");
          download(`copilot-accounts-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(value, undefined, 2)}\n`);
          setNotice(t("exported"));
        });

      const startLogin = () =>
        run("login", async () => {
          setFlow(await call("login/start", { method: "POST", body: "{}" }));
          setLoginOpen(true);
        });

      const cancelLogin = async () => {
        setLoginOpen(false);
        try {
          await call("login/cancel", { method: "POST", body: "{}" });
        } catch {
          // the dialog is already closed
        }
        setFlow({ state: "idle" });
      };

      const doImport = () =>
        run("import", async () => {
          const value = await call("import", { method: "POST", body: JSON.stringify({ text: importText }) });
          setView(value.vault);
          setImportOpen(false);
          setImportText("");
          setNotice(t("imported", { n: value.imported.length }));
        });

      const onFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setImportText(await file.text());
      };

      if (view === null) {
        return jsx("div", { style: css.page, children: jsx("div", { style: css.hint, children: t("loading") }) });
      }

      const accounts = view.accounts ?? [];
      const active = accounts.find((account) => account.current);

      return jsxs("div", {
        style: css.page,
        children: [
          jsxs("div", {
            style: css.header,
            children: [
              jsx("h2", { style: css.title, children: t("title") }),
              jsx("p", { style: css.intro, children: t("intro") }),
            ],
          }),
          jsxs("div", {
            style: css.actions,
            children: [
              jsx(Button, { variant: "outline", disabled: busy !== "", onClick: () => void saveCurrent(), children: busy === "save" ? t("saving") : t("saveCurrent") }),
              jsx(Button, { variant: "primary", disabled: busy !== "", onClick: () => void startLogin(), children: t("addAccount") }),
              jsx(Button, { variant: "outline", disabled: busy !== "", onClick: () => setImportOpen(true), children: t("upload") }),
              jsx(Button, { variant: "outline", disabled: busy !== "", onClick: () => void exportAll(), children: t("exportAll") }),
            ],
          }),
          notice.length > 0 ? jsx("div", { style: css.notice, children: notice }) : null,
          error.length > 0 ? jsx("div", { style: css.error, children: error }) : null,
          jsxs("div", {
            style: css.section,
            children: [
              jsx("h3", { style: css.sectionTitle, children: t("current") }),
              active === undefined
                ? jsxs("div", {
                    style: css.card,
                    children: [
                      jsx("div", { style: css.avatar, "aria-hidden": true, children: "?" }),
                      jsxs("div", {
                        style: css.body,
                        children: [
                          jsx("div", { style: css.login, children: t("none") }),
                          jsx("div", { style: css.meta, children: t("signedOutHint") }),
                        ],
                      }),
                    ],
                  })
                : jsx(AccountCard, { account: active, busy: busy === "use", onUse: useAccount, onDelete: deleteAccount }),
            ],
          }),
          jsxs("div", {
            style: css.section,
            children: [
              jsx("h3", { style: css.sectionTitle, children: t("saved") }),
              accounts.filter((account) => !account.current).length === 0
                ? jsx("div", { style: css.hint, children: t("empty") })
                : jsxs(Fragment, {
                    children: accounts
                      .filter((account) => !account.current)
                      .map((account) => jsx(AccountCard, { account, busy: busy === "use", onUse: useAccount, onDelete: deleteAccount }, account.id)),
                  }),
            ],
          }),
          jsxs("div", {
            style: css.footer,
            children: [jsx("div", { children: `${t("vault")}: ${view.vaultPath}` }), jsx("div", { children: t("security") })],
          }),
          jsx(Modal, {
            open: loginOpen,
            onClose: () => void cancelLogin(),
            title: t("loginTitle"),
            description: t("loginDesc"),
            closeLabel: t("close"),
            footer: jsxs(Fragment, {
              children: [
                jsx(Button, { variant: "outline", onClick: () => void cancelLogin(), children: t("close") }),
                jsx(Button, {
                  variant: "primary",
                  onClick: () => {
                    if (flow.verificationUri) globalThis.open(flow.verificationUri, "_blank", "noopener,noreferrer");
                  },
                  disabled: !flow.verificationUri,
                  children: t("openGitHub"),
                }),
              ],
            }),
            children: jsxs("div", {
              style: css.modalBody,
              children: [
                flow.state === "done"
                  ? jsx("div", { style: css.notice, children: t("loginDone") })
                  : jsxs(Fragment, {
                      children: [
                        jsx("div", { style: css.code, children: flow.userCode ?? "…" }),
                        jsx("div", { style: css.hint, children: flow.state === "error" ? flow.error : t("waiting") }),
                      ],
                    }),
              ],
            }),
          }),
          jsx(Modal, {
            open: importOpen,
            onClose: () => setImportOpen(false),
            title: t("importTitle"),
            description: t("importDesc"),
            closeLabel: t("close"),
            footer: jsxs(Fragment, {
              children: [
                jsx(Button, { variant: "outline", onClick: () => setImportOpen(false), children: t("cancel") }),
                jsx(Button, {
                  variant: "primary",
                  disabled: busy === "import" || importText.trim().length === 0,
                  onClick: () => void doImport(),
                  children: busy === "import" ? t("importing") : t("importAction"),
                }),
              ],
            }),
            children: jsxs("div", {
              style: css.modalBody,
              children: [
                jsx("textarea", {
                  value: importText,
                  onChange: (event) => setImportText(event.target.value),
                  placeholder: t("importPlaceholder"),
                  style: css.textarea,
                  spellCheck: false,
                }),
                jsxs("div", {
                  style: css.hint,
                  children: [
                    t("importHint"),
                    " ",
                    jsx("button", { type: "button", style: css.link, onClick: () => fileRef.current?.click(), children: t("chooseFile") }),
                  ],
                }),
                jsx("input", {
                  ref: fileRef,
                  type: "file",
                  accept: ".json,.yaml,.yml,.txt",
                  style: { display: "none" },
                  onChange: (event) => void onFile(event),
                }),
              ],
            }),
          }),
        ],
      });
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            {
              name: "settings.section",
              id: "copilot-accounts",
              order: 12,
              label: () => t("nav"),
            },
            SettingsPage,
          ),
        );
      },
    };
  },
});
