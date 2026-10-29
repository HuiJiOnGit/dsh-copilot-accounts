/**
 * dsh-copilot-accounts — Client half.
 *
 * One Settings page with three inline sections: the active/saved accounts,
 * a shareable device-flow sign-in, and upload. No dialogs: every control and
 * every result stays in this panel.
 */
window.__ModuleLoader__.load({
  id: "dsh-copilot-accounts",
  factory(require) {
    const React = require("react");
    const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
    const { Button, writeClipboard } = require("@deepseek-ai/dsh-client-ui-primitives");
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
        signedOutHint: "可以在下面生成登录链接，或上传一份别人已登录的凭据。",
        saved: "已保存的账号",
        empty: "还没有保存过账号。登录一个账号后会自动保存。",
        exportOne: "导出",
        refreshCredits: "刷新额度",
        quota: "剩余 {remaining} / {entitlement}",
        quotaUsed: "已用 {used}",
        quotaUnlimited: "额度无限",
        quotaUnavailable: "额度不可用",
        quotaReset: "{date} 重置",
        recommended: "推荐",
        uploadBadge: "未经过实际测试",
        uploadWarning: "上传功能还没有经过实际测试，优先用上面的分享登录链接；上传失败的话，让对方重新发一个分享链接。",
        saveCurrent: "保存当前账号",
        exportAll: "导出全部",
        logout: "退出登录",
        logoutConfirm: "退出只清除 DSH 当前的登录凭据，账号仍保留在下面的列表里，随时可以切回来。",
        logoutAction: "确认退出",
        logoutCancel: "取消",
        loggedOut: "已退出当前登录，账号仍保存在列表中。",
        switch: "切换",
        remove: "删除",
        switching: "切换中…",
        saving: "保存中…",
        models: "个模型",
        lastUsed: "上次使用",
        currentBadge: "当前",
        shareTitle: "添加 / 分享登录",
        shareDesc: "生成一次性授权链接。可以自己用，也可以复制发给别人——对方在自己的浏览器里打开并授权，你不需要退出自己的 GitHub 账号。",
        generateLink: "生成授权链接",
        regenerate: "再生成一个",
        cancelFlow: "取消这次登录",
        copyCode: "复制代码",
        copyLink: "复制链接",
        copyInvite: "复制邀请",
        copied: "已复制",
        copyFailed: "复制失败，请手动选中复制",
        shareNote: "发给对方的内容：",
        openHere: "在本机打开",
        shareLoginHint: "对方打开链接输入代码即可，不需要知道你的账号。",
        waiting: "等待对方授权…（15 分钟内有效）",
        loginDone: "已添加并切换到新账号。",
        closeHint: "离开这个页面不会中断等待；授权完成后账号会自动加入列表。",
        uploadTitle: "上传账号",
        uploadDesc: "支持三种来源：本插件的账号卡片、DSH 凭据文件、或一个长效 token。",
        uploadPlaceholder: "在这里粘贴：账号卡片 JSON / .credentials.yaml 内容 / ghu_ 开头的 token",
        importAction: "导入",
        importing: "导入中…",
        chooseFile: "选择文件…",
        imported: "已导入 {n} 个账号。",
        exported: "已导出全部账号。",
        savedCurrent: "已保存当前账号。",
        switched: "已切换，下一条消息会自动换用新账号的 token。",
        deleted: "已删除该账号。",
        error: "出错了：{message}",
        vault: "账号文件",
        credentials: "DSH 凭据文件",
        security: "账号文件里是明文 token，请只放在自己的电脑上。",
        helpTitle: "不知道要上传什么？点开看",
        help1Title: "方式 1 · 对方也装了本插件（最省事）",
        help1Body: "对方打开 设置 → Copilot 账号 → 导出全部，得到 copilot-accounts-日期.json，发给你；你把内容粘贴到上面，或点“选择文件”选中它。",
        help2Title: "方式 2 · 对方没装插件",
        help2Body: "让对方打开自己的 DSH 凭据文件，把 refs 里的 GITHUB_COPILOT_OAUTH_TOKEN 那一行，和 records 里的 llm-pi-ai/github-copilot 整段复制给你；把整份文件直接粘贴进来也可以。",
        help3Title: "方式 3 · 只有 token",
        help3Body: "直接粘贴 ghu_ 开头的长效 token（gho_ / github_pat_ 也行）。不需要复制 access / expires。",
        helpPaths: "对方机器的路径通常是：C:\\Users\\<用户名>\\.dsh\\.credentials.yaml（macOS/Linux：~/.dsh/.credentials.yaml）。本机路径见下方。",
        acceptHint: "支持 .json / .yaml / .yml / .txt",
      },
      en: {
        nav: "Copilot Accounts",
        title: "GitHub Copilot Accounts",
        intro: "Keep several signed-in Copilot accounts and switch with one click. Switching only rewrites DSH credentials; it never signs you out of GitHub.",
        loading: "Loading…",
        current: "Active",
        none: "No Copilot account is signed in right now.",
        signedOutHint: "Generate a sign-in link below, or upload credentials someone else is already signed in with.",
        saved: "Saved accounts",
        empty: "Nothing saved yet. Signing in saves the account automatically.",
        exportOne: "Export",
        refreshCredits: "Refresh quota",
        quota: "Remaining {remaining} / {entitlement}",
        quotaUsed: "used {used}",
        quotaUnlimited: "Unlimited quota",
        quotaUnavailable: "Quota unavailable",
        quotaReset: "resets {date}",
        recommended: "Recommended",
        uploadBadge: "Not field-tested",
        uploadWarning: "Uploading has not been field-tested. Prefer the share sign-in link above; if an upload fails, ask for a fresh share link.",
        saveCurrent: "Save current",
        exportAll: "Export all",
        logout: "Sign out",
        logoutConfirm: "Signing out clears the DSH credential only; the account stays in the list and can be switched back.",
        logoutAction: "Sign out",
        logoutCancel: "Cancel",
        loggedOut: "Signed out. The account is still saved.",
        switch: "Switch",
        remove: "Delete",
        switching: "Switching…",
        saving: "Saving…",
        models: "models",
        lastUsed: "Last used",
        currentBadge: "active",
        shareTitle: "Add / share sign-in",
        shareDesc: "Creates a one-time authorization link. Use it yourself, or send it to someone else: they authorize in their own browser, and you never sign out of GitHub.",
        generateLink: "Generate sign-in link",
        regenerate: "Generate another",
        cancelFlow: "Cancel this sign-in",
        copyCode: "Copy code",
        copyLink: "Copy link",
        copyInvite: "Copy invite",
        copied: "Copied",
        copyFailed: "Copy failed — select and copy manually",
        shareNote: "Send this to the other person:",
        openHere: "Open here",
        shareLoginHint: "They only need the link and code; they never see your account.",
        waiting: "Waiting for authorization… (valid for 15 minutes)",
        loginDone: "Account added and switched.",
        closeHint: "Leaving this page does not interrupt the wait; the account joins the list when authorization finishes.",
        uploadTitle: "Upload account",
        uploadDesc: "Three sources work: this plugin's account card, a DSH credentials file, or one long-lived token.",
        uploadPlaceholder: "Paste an account-card JSON / .credentials.yaml content / a ghu_ token here",
        importAction: "Import",
        importing: "Importing…",
        chooseFile: "Choose a file…",
        imported: "Imported {n} account(s).",
        exported: "Exported every account.",
        savedCurrent: "Current account saved.",
        switched: "Switched. The next message uses the new account's token.",
        deleted: "Account deleted.",
        error: "Something failed: {message}",
        vault: "Account file",
        credentials: "DSH credentials file",
        security: "The account file holds plaintext tokens; keep it on your own machine.",
        helpTitle: "Not sure what to upload? Open this",
        help1Title: "Option 1 · the other side also runs this plugin",
        help1Body: "They open Settings → Copilot Accounts → Export all, get copilot-accounts-<date>.json, and send it to you. Paste it above or use “Choose a file”.",
        help2Title: "Option 2 · they do not run the plugin",
        help2Body: "Ask them to open their DSH credentials file and copy the GITHUB_COPILOT_OAUTH_TOKEN line under refs plus the whole llm-pi-ai/github-copilot block under records. Pasting the entire file also works.",
        help3Title: "Option 3 · just a token",
        help3Body: "Paste a long-lived ghu_ token (gho_ / github_pat_ also work). No need to copy access or expires.",
        helpPaths: "On their machine the file is usually C:\\Users\\<name>\\.dsh\\.credentials.yaml (macOS/Linux: ~/.dsh/.credentials.yaml). This machine's paths are below.",
        acceptHint: ".json / .yaml / .yml / .txt",
      },
    };

    function t(key, params) {
      const text = STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
      if (params === undefined) return text;
      return text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
    }

    const css = {
      page: { display: "flex", flexDirection: "column", gap: "18px", padding: "4px 0 24px", maxWidth: "760px" },
      header: { display: "flex", flexDirection: "column", gap: "6px" },
      title: { fontSize: "18px", fontWeight: 600, margin: 0 },
      intro: { margin: 0, opacity: 0.72, fontSize: "13px", lineHeight: 1.5 },
      section: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "14px",
        borderRadius: "12px",
        border: "1px solid rgba(127,127,127,0.24)",
        background: "rgba(127,127,127,0.04)",
      },
      sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" },
      sectionTitle: { fontSize: "14px", fontWeight: 600, margin: 0 },
      sectionDesc: { margin: 0, opacity: 0.66, fontSize: "12px", lineHeight: 1.6 },
      actions: { display: "flex", flexWrap: "wrap", gap: "8px" },
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
      tag: {
        fontSize: "11px",
        fontWeight: 600,
        padding: "1px 8px",
        borderRadius: "999px",
        color: "#bf8700",
        border: "1px solid rgba(191,135,0,0.55)",
        background: "rgba(191,135,0,0.08)",
        whiteSpace: "nowrap",
      },
      warning: { margin: 0, fontSize: "12px", color: "#bf8700", lineHeight: 1.6 },
      confirm: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px dashed rgba(191,135,0,0.55)",
        background: "rgba(191,135,0,0.06)",
        fontSize: "12px",
        lineHeight: 1.6,
      },
      quota: { fontSize: "12px", opacity: 0.78 },
      meta: { fontSize: "12px", opacity: 0.62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      rowActions: { display: "flex", gap: "6px", flex: "0 0 auto", flexWrap: "wrap" },
      notice: { fontSize: "12px", color: "#2da44e" },
      error: { fontSize: "12px", color: "#d1242f", whiteSpace: "pre-wrap" },
      textarea: {
        width: "100%",
        minHeight: "120px",
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
      hint: { fontSize: "12px", opacity: 0.66, lineHeight: 1.6 },
      code: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "20px",
        letterSpacing: "3px",
        fontWeight: 700,
        padding: "10px 14px",
        borderRadius: "10px",
        border: "1px dashed rgba(127,127,127,0.5)",
        textAlign: "center",
        userSelect: "all",
        whiteSpace: "nowrap",
      },
      codeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
      shareBox: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid rgba(127,127,127,0.28)",
        background: "rgba(127,127,127,0.05)",
      },
      shareText: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "12px",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "normal",
        userSelect: "all",
      },
      inlineRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
      help: {
        borderRadius: "8px",
        border: "1px solid rgba(127,127,127,0.28)",
        padding: "8px 10px",
        fontSize: "12px",
        lineHeight: 1.6,
      },
      helpSummary: { cursor: "pointer", fontWeight: 600 },
      helpBody: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px", opacity: 0.85 },
      path: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "11px",
        wordBreak: "break-all",
        opacity: 0.7,
      },
      footer: { fontSize: "11px", opacity: 0.55, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "2px" },
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

    function inviteText(flow) {
      const url = flow?.verificationUri || "https://github.com/login/device";
      const code = flow?.userCode ?? "";
      return LANG === "zh"
        ? `请打开 ${url} 并输入代码 ${code}，完成 GitHub Copilot 授权（15 分钟内有效）。`
        : `Open ${url} and enter code ${code} to authorize GitHub Copilot (valid for 15 minutes).`;
    }

    function inviteLink(flow) {
      const url = flow?.verificationUri || "https://github.com/login/device";
      if (!flow?.userCode) return url;
      return `${url}?user_code=${encodeURIComponent(flow.userCode)}`;
    }

    function formatNumber(value) {
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    /** One short line for an account's premium-interaction quota, when known. */
    function quotaText(quota) {
      if (quota === undefined) return undefined;
      if (quota.error) return t("quotaUnavailable");
      if (quota.unlimited) return t("quotaUnlimited");
      if (quota.remaining !== undefined && quota.entitlement !== undefined) {
        const parts = [t("quota", { remaining: formatNumber(quota.remaining), entitlement: formatNumber(quota.entitlement) })];
        if (quota.used !== undefined) parts.push(t("quotaUsed", { used: formatNumber(quota.used) }));
        if (quota.resetDate) parts.push(t("quotaReset", { date: quota.resetDate }));
        return parts.join(" · ");
      }
      return undefined;
    }

    function AccountCard({ account, busy, credits, onUse, onDelete, onExport }) {
      const metaParts = [];
      if (account.name) metaParts.push(account.name);
      if (account.models) metaParts.push(`${account.models} ${t("models")}`);
      const lastUsed = formatTime(account.lastUsedAt);
      if (lastUsed) metaParts.push(`${t("lastUsed")} ${lastUsed}`);
      const quota = quotaText(credits?.[account.id]);
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
              quota !== undefined ? jsx("div", { style: css.quota, children: quota }) : null,
            ].filter(Boolean),
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
                onClick: () => onExport(account),
                children: t("exportOne"),
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
      const [importText, setImportText] = useState("");
      const [copied, setCopied] = useState("");
      const [credits, setCredits] = useState({});
      const [confirmLogout, setConfirmLogout] = useState(false);
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
          const next = await call("list");
          setView(next);
          return next;
        } catch (failure) {
          setError(t("error", { message: failure instanceof Error ? failure.message : String(failure) }));
          return undefined;
        }
      };

      /** Quota is best-effort: a failure never blocks the page. */
      const loadCredits = async (force) => {
        try {
          const value = await call(`credits${force ? "?force=1" : ""}`);
          setCredits(value.credits ?? {});
        } catch {
          // leave the previous quota values in place
        }
      };

      useEffect(() => {
        void refresh().then(() => loadCredits(false));
      }, []);

      // A shared sign-in is completed by the host; keep this panel in sync.
      useEffect(() => {
        if (view?.login?.state !== "pending") return undefined;
        const timer = setInterval(async () => {
          try {
            const next = await call("list");
            setView(next);
            if (next.login?.state === "done") setNotice(t("loginDone"));
          } catch {
            // transient failure: the host keeps polling regardless
          }
        }, 2500);
        return () => clearInterval(timer);
      }, [view?.login?.state]);

      const copy = async (kind, text) => {
        try {
          const ok = await writeClipboard(text);
          setCopied(ok ? kind : "");
          if (!ok) setError(t("copyFailed"));
        } catch {
          setError(t("copyFailed"));
        }
      };

      useEffect(() => {
        if (copied === "") return undefined;
        const timer = setTimeout(() => setCopied(""), 2000);
        return () => clearTimeout(timer);
      }, [copied]);

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
          void loadCredits(false);
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

      const exportOne = (account) =>
        run("export", async () => {
          const value = await call("export", { method: "POST", body: JSON.stringify({ id: account.id }) });
          const safe = (account.login ?? account.id).replace(/[^A-Za-z0-9._-]+/g, "-");
          download(`copilot-account-${safe}-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(value, undefined, 2)}\n`);
          setNotice(t("exported"));
        });

      const doLogout = () =>
        run("logout", async () => {
          setView(await call("logout", { method: "POST", body: "{}" }));
          setConfirmLogout(false);
          setNotice(t("loggedOut"));
        });

      const startLogin = () =>
        run("login", async () => {
          await call("login/start", { method: "POST", body: "{}" });
          await refresh();
        });

      const cancelFlow = () =>
        run("cancel", async () => {
          await call("login/cancel", { method: "POST", body: "{}" });
          await refresh();
        });

      const doImport = () =>
        run("import", async () => {
          const value = await call("import", { method: "POST", body: JSON.stringify({ text: importText }) });
          setView(value.vault);
          setImportText("");
          setNotice(t("imported", { n: value.imported.length }));
          void loadCredits(false);
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
      const flow = view.login ?? { state: "idle" };
      const pending = flow.state === "pending";
      const failed = flow.state === "error" || flow.state === "expired" || flow.state === "denied";

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
          notice.length > 0 ? jsx("div", { style: css.notice, children: notice }) : null,
          error.length > 0 ? jsx("div", { style: css.error, children: error }) : null,

          jsxs("div", {
            style: css.section,
            children: [
              jsxs("div", {
                style: css.sectionHead,
                children: [
                  jsx("h3", { style: css.sectionTitle, children: t("current") }),
                  jsxs("div", {
                    style: css.actions,
                    children: [
                      jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "", onClick: () => void saveCurrent(), children: busy === "save" ? t("saving") : t("saveCurrent") }),
                      jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "", onClick: () => void run("credits", () => loadCredits(true)), children: busy === "credits" ? t("saving") : t("refreshCredits") }),
                      jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "", onClick: () => void exportAll(), children: t("exportAll") }),
                      active === undefined
                        ? null
                        : jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "" || confirmLogout, onClick: () => setConfirmLogout(true), children: t("logout") }),
                    ].filter(Boolean),
                  }),
                ],
              }),
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
                : jsx(AccountCard, { account: active, busy: busy === "use", credits, onUse: useAccount, onDelete: deleteAccount, onExport: exportOne }),
              confirmLogout && active !== undefined
                ? jsxs("div", {
                    style: css.confirm,
                    children: [
                      jsx("span", { children: t("logoutConfirm") }),
                      jsxs("div", {
                        style: css.actions,
                        children: [
                          jsx(Button, {
                            variant: "primary",
                            size: "sm",
                            disabled: busy !== "",
                            onClick: () => void doLogout(),
                            children: busy === "logout" ? t("saving") : t("logoutAction"),
                          }),
                          jsx(Button, { variant: "outline", size: "sm", onClick: () => setConfirmLogout(false), children: t("logoutCancel") }),
                        ],
                      }),
                    ],
                  })
                : null,
              jsxs("div", {
                style: { display: "flex", flexDirection: "column", gap: "8px" },
                children: [
                  jsx("h3", { style: css.sectionTitle, children: t("saved") }),
                  accounts.filter((account) => !account.current).length === 0
                    ? jsx("div", { style: css.hint, children: t("empty") })
                    : jsxs(Fragment, {
                        children: accounts
                          .filter((account) => !account.current)
                          .map((account) => jsx(AccountCard, { account, busy: busy === "use", credits, onUse: useAccount, onDelete: deleteAccount, onExport: exportOne }, account.id)),
                      }),
                ],
              }),
            ],
          }),

          jsxs("div", {
            style: css.section,
            children: [
              jsxs("div", {
                style: css.sectionHead,
                children: [
                  jsx("h3", { style: css.sectionTitle, children: t("shareTitle") }),
                  jsx("span", { style: css.badge, children: t("recommended") }),
                ],
              }),
              jsx("p", { style: css.sectionDesc, children: t("shareDesc") }),
              pending
                ? jsxs(Fragment, {
                    children: [
                      jsxs("div", {
                        style: css.codeRow,
                        children: [
                          jsx("div", { style: css.code, children: flow.userCode ?? "…" }),
                          jsx(Button, {
                            variant: "outline",
                            size: "sm",
                            onClick: () => void copy("code", flow.userCode ?? ""),
                            children: copied === "code" ? t("copied") : t("copyCode"),
                          }),
                        ],
                      }),
                      jsxs("div", {
                        style: css.shareBox,
                        children: [
                          jsx("div", { style: css.hint, children: t("shareNote") }),
                          jsx("div", { style: css.shareText, children: inviteText(flow) }),
                          jsxs("div", {
                            style: css.inlineRow,
                            children: [
                              jsx(Button, {
                                variant: "primary",
                                size: "sm",
                                onClick: () => void copy("invite", inviteText(flow)),
                                children: copied === "invite" ? t("copied") : t("copyInvite"),
                              }),
                              jsx(Button, {
                                variant: "outline",
                                size: "sm",
                                onClick: () => void copy("link", inviteLink(flow)),
                                children: copied === "link" ? t("copied") : t("copyLink"),
                              }),
                              jsx(Button, {
                                variant: "outline",
                                size: "sm",
                                onClick: () => {
                                  if (flow.verificationUri) globalThis.open(flow.verificationUri, "_blank", "noopener,noreferrer");
                                },
                                children: t("openHere"),
                              }),
                            ],
                          }),
                          jsx("div", { style: css.hint, children: t("shareLoginHint") }),
                        ],
                      }),
                      jsx("div", { style: css.hint, children: t("waiting") }),
                      jsx("div", { style: css.hint, children: t("closeHint") }),
                      jsxs("div", {
                        style: css.actions,
                        children: [
                          jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "", onClick: () => void cancelFlow(), children: t("cancelFlow") }),
                        ],
                      }),
                    ],
                  })
                : flow.state === "done"
                  ? jsxs("div", {
                      style: { display: "flex", flexDirection: "column", gap: "8px" },
                      children: [
                        jsx("div", { style: css.notice, children: t("loginDone") }),
                        jsxs("div", {
                          style: css.actions,
                          children: [
                            jsx(Button, { variant: "outline", size: "sm", disabled: busy !== "", onClick: () => void startLogin(), children: t("regenerate") }),
                          ],
                        }),
                      ],
                    })
                  : jsxs("div", {
                      style: { display: "flex", flexDirection: "column", gap: "8px" },
                      children: [
                        failed ? jsx("div", { style: css.error, children: flow.error ?? flow.state }) : null,
                        jsxs("div", {
                          style: css.actions,
                          children: [
                            jsx(Button, { variant: "primary", size: "sm", disabled: busy !== "", onClick: () => void startLogin(), children: failed ? t("regenerate") : t("generateLink") }),
                          ],
                        }),
                      ],
                    }),
            ],
          }),

          jsxs("div", {
            style: css.section,
            children: [
              jsxs("div", {
                style: css.sectionHead,
                children: [
                  jsx("h3", { style: css.sectionTitle, children: t("uploadTitle") }),
                  jsx("span", { style: css.tag, children: t("uploadBadge") }),
                ],
              }),
              jsx("p", { style: css.sectionDesc, children: t("uploadDesc") }),
              jsx("p", { style: css.warning, children: t("uploadWarning") }),
              jsx("textarea", {
                value: importText,
                onChange: (event) => setImportText(event.target.value),
                placeholder: t("uploadPlaceholder"),
                style: css.textarea,
                spellCheck: false,
              }),
              jsxs("div", {
                style: css.inlineRow,
                children: [
                  jsx(Button, {
                    variant: "primary",
                    size: "sm",
                    disabled: busy === "import" || importText.trim().length === 0,
                    onClick: () => void doImport(),
                    children: busy === "import" ? t("importing") : t("importAction"),
                  }),
                  jsx(Button, { variant: "outline", size: "sm", onClick: () => fileRef.current?.click(), children: t("chooseFile") }),
                  jsx("span", { style: css.hint, children: t("acceptHint") }),
                ],
              }),
              jsx("input", {
                ref: fileRef,
                type: "file",
                accept: ".json,.yaml,.yml,.txt",
                style: { display: "none" },
                onChange: (event) => void onFile(event),
              }),
              jsxs("details", {
                style: css.help,
                children: [
                  jsx("summary", { style: css.helpSummary, children: t("helpTitle") }),
                  jsxs("div", {
                    style: css.helpBody,
                    children: [
                      jsxs("div", {
                        children: [
                          jsx("div", { style: { fontWeight: 600 }, children: t("help1Title") }),
                          jsx("div", { children: t("help1Body") }),
                        ],
                      }),
                      jsxs("div", {
                        children: [
                          jsx("div", { style: { fontWeight: 600 }, children: t("help2Title") }),
                          jsx("div", { children: t("help2Body") }),
                        ],
                      }),
                      jsxs("div", {
                        children: [
                          jsx("div", { style: { fontWeight: 600 }, children: t("help3Title") }),
                          jsx("div", { children: t("help3Body") }),
                        ],
                      }),
                      jsx("div", { style: css.hint, children: t("helpPaths") }),
                      jsxs("div", {
                        style: css.path,
                        children: [jsx("div", { children: `${t("credentials")}: ${view.credentialsPath}` }), jsx("div", { children: `${t("vault")}: ${view.vaultPath}` })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          jsxs("div", {
            style: css.footer,
            children: [
              jsx("div", { children: `${t("vault")}: ${view.vaultPath}` }),
              jsx("div", { children: `${t("credentials")}: ${view.credentialsPath}` }),
              jsx("div", { children: t("security") }),
            ],
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
