"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Download,
  FileUp,
  ImagePlus,
  Paperclip,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  Button,
  Card,
  Field,
  NumberInput,
  SectionLabel,
} from "@/components/ui";
import { useStore, useProfileData, useActiveProfile } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { buildSystemPrompt, DEFAULT_ROLE } from "@/lib/ai/context";
import { sendChat, type Attachment } from "@/lib/ai/client";
import {
  clearCustomContext,
  clearHistory,
  loadCustomContext,
  loadHistory,
  saveCustomContext,
  saveHistory,
} from "@/lib/ai/history";
import { downloadText } from "@/lib/backup/download";
import type { AiChatPrefs, AiMessage } from "@/lib/types";

const DEFAULT_PREFS: AiChatPrefs = {
  logsWindowDays: 1,
  includeAllLogs: false,
  includeCheckIns: true,
  includeMeasurements: true,
  includeLabs: true,
};

/** Very light markdown rendering: bold, paragraphs, bullets, numbered lists. */
function renderMarkdown(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n{2,}/);
  const nodes: React.ReactNode[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi].trim();
    if (!para) continue;

    const lines = para.split("\n");

    // Bullet list
    if (lines.every((l) => /^[-*] /.test(l.trim()))) {
      nodes.push(
        <ul key={pi} className="ml-4 list-disc space-y-1">
          {lines.map((l, li) => (
            <li key={li}>{inlineParts(l.replace(/^[-*] /, ""))}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (lines.every((l) => /^\d+\. /.test(l.trim()))) {
      nodes.push(
        <ol key={pi} className="ml-4 list-decimal space-y-1">
          {lines.map((l, li) => (
            <li key={li}>{inlineParts(l.replace(/^\d+\. /, ""))}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Heading
    if (lines.length === 1 && /^#{1,3} /.test(lines[0])) {
      nodes.push(
        <p key={pi} className="font-bold">
          {inlineParts(lines[0].replace(/^#{1,3} /, ""))}
        </p>
      );
      continue;
    }

    // Regular paragraph (may have soft line breaks)
    nodes.push(
      <p key={pi}>
        {lines.map((l, li) => (
          <span key={li}>
            {inlineParts(l)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return nodes;
}

function inlineParts(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length) {
    const open = rest.indexOf("**");
    if (open === -1) break;
    const close = rest.indexOf("**", open + 2);
    if (close === -1) break;
    if (open > 0) parts.push(<span key={key++}>{rest.slice(0, open)}</span>);
    parts.push(<strong key={key++}>{rest.slice(open + 2, close)}</strong>);
    rest = rest.slice(close + 2);
  }
  if (rest) parts.push(<span key={key}>{rest}</span>);
  return parts;
}

/** Read a File and return an Attachment, or null if the type is unsupported. */
async function readAttachment(file: File): Promise<Attachment | null> {
  const isImage = file.type.startsWith("image/");
  const isText = file.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(file.name);

  if (!isImage && !isText) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    if (isImage) {
      reader.onload = () =>
        resolve({
          name: file.name,
          kind: "image",
          data: reader.result as string,
          mime: file.type,
        });
      reader.readAsDataURL(file);
    } else {
      reader.onload = () =>
        resolve({
          name: file.name,
          kind: "text",
          data: reader.result as string,
          mime: file.type || "text/plain",
        });
      reader.readAsText(file);
    }
  });
}

export default function AssistantPage() {
  const { t } = useLang();
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const customPeptides = useStore((s) => s.customPeptides);

  const profile = useActiveProfile();
  const { protocols, logs, vials, measurements, labs, checkIns } = useProfileData();

  const aiConfig = settings.ai;
  const isConfigured = !!(aiConfig?.url && aiConfig?.secret && aiConfig?.model);

  const prefs: AiChatPrefs = { ...DEFAULT_PREFS, ...(settings.aiChat ?? {}) };

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [customContext, setCustomContext] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);
  const dataLoaded = useRef(false);

  // Load history and custom context from IDB once profile is known
  useEffect(() => {
    if (!hydrated || dataLoaded.current) return;
    dataLoaded.current = true;
    loadHistory(profile.id).then(setMessages);
    loadCustomContext(profile.id).then(setCustomContext);
  }, [hydrated, profile.id]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || !isConfigured || sending) return;

    const userMsg: AiMessage = { id: nanoid(), role: "user", content: text, at: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setSending(true);

    const systemPrompt = customContext ?? buildSystemPrompt({
      profile,
      protocols,
      logs,
      vials,
      measurements,
      labs,
      checkIns,
      customPeptides,
      prefs,
    });

    const result = await sendChat({
      config: aiConfig!,
      systemPrompt,
      history: messages,
      userMessage: text,
      attachments,
    });

    const assistantMsg: AiMessage = {
      id: nanoid(),
      role: "assistant",
      content: result.ok ? result.content : `Error: ${result.error}`,
      at: Date.now(),
    };

    const withReply = [...next, assistantMsg];
    setMessages(withReply);
    await saveHistory(profile.id, withReply);
    setSending(false);
  }

  async function handleClear() {
    await clearHistory(profile.id);
    setMessages([]);
    setConfirmClear(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function updatePrefs(patch: Partial<AiChatPrefs>) {
    updateSettings({ aiChat: { ...prefs, ...patch } });
  }

  // --- Context export/import ---

  function handleExportContext() {
    const text = customContext ?? buildSystemPrompt({
      profile,
      protocols,
      logs,
      vials,
      measurements,
      labs,
      checkIns,
      customPeptides,
      prefs,
    });
    const filename = `bench-context-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadText(text, filename, "text/plain");
  }

  async function handleImportContext(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!contextInputRef.current) return;
    contextInputRef.current.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      setCustomContext(text);
      await saveCustomContext(profile.id, text);
    };
    reader.readAsText(file);
  }

  async function handleClearCustomContext() {
    setCustomContext(null);
    await clearCustomContext(profile.id);
  }

  // --- File attachments ---

  async function handleAttachFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachError(null);
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!files.length) return;

    const results = await Promise.all(files.map(readAttachment));
    const skipped = files.filter((_, i) => results[i] === null);
    const added = results.filter((r): r is Attachment => r !== null);

    if (skipped.length) {
      setAttachError(t("assistant_attach_unsupported", { n: skipped.length }));
    }
    setAttachments((prev) => [...prev, ...added]);
  }

  if (!hydrated) {
    return (
      <div className="py-20 text-center text-[14px] text-[var(--faint)]">
        {t("loading")}
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-xl space-y-6 pt-8">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] bg-[var(--sunken)]">
            <Bot size={32} className="text-[var(--faint)]" />
          </div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--ink)]">
            {t("assistant_title")}
          </h1>
          <p className="max-w-sm text-[14px] leading-relaxed text-[var(--muted)]">
            {t("assistant_no_config")}
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-[var(--r-btn)] bg-[var(--mint)] px-5 py-2.5 text-[14px] font-semibold text-[var(--on-accent)] shadow-[var(--shadow-pop)]"
          >
            <Settings2 size={16} />
            {t("assistant_go_to_settings")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100dvh - var(--header-h) - var(--safe-top) - 7rem)" }}>
      {/* Header row */}
      <div className="mb-3 flex items-center gap-2">
        <Bot size={20} className="text-[var(--mint)]" />
        <h1 className="flex-1 text-[18px] font-extrabold tracking-tight text-[var(--ink)]">
          {t("assistant_title")}
        </h1>

        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-label={t("assistant_prefs")}
          className="press flex h-9 w-9 items-center justify-center rounded-[var(--r-btn)] text-[var(--muted)] hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
        >
          {settingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {messages.length > 0 && !confirmClear && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            aria-label={t("assistant_clear")}
            className="press flex h-9 w-9 items-center justify-center rounded-[var(--r-btn)] text-[var(--muted)] hover:bg-[var(--rose-soft)] hover:text-[var(--rose-ink)]"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Confirm clear */}
      {confirmClear && (
        <Card className="mb-3 flex items-center gap-3 p-3">
          <p className="flex-1 text-[13px] text-[var(--ink)]">{t("assistant_clear_confirm")}</p>
          <button
            type="button"
            onClick={() => setConfirmClear(false)}
            className="press rounded-[var(--r-btn)] px-3 py-1.5 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--sunken)]"
          >
            <X size={14} />
          </button>
          <Button variant="danger" onClick={handleClear} className="py-1.5 text-[13px]">
            {t("assistant_clear_ok")}
          </Button>
        </Card>
      )}

      {/* Context settings panel */}
      {settingsOpen && (
        <Card className="mb-3 space-y-4 p-4">
          <SectionLabel>{t("assistant_prefs")}</SectionLabel>

          {/* Custom context badge */}
          {customContext && (
            <div className="flex items-center gap-2 rounded-[var(--r-inner)] bg-[var(--mint-soft)] px-3 py-2">
              <span className="flex-1 text-[13px] font-medium text-[var(--mint-ink)]">
                {t("assistant_custom_context_active")}
              </span>
              <button
                type="button"
                onClick={handleClearCustomContext}
                className="press text-[12px] font-semibold text-[var(--mint-ink)] underline"
              >
                {t("assistant_clear_custom")}
              </button>
            </div>
          )}

          {/* Export / Import context */}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={handleExportContext} className="py-2 text-[13px]">
              <Download size={14} /> {t("assistant_export_context")}
            </Button>
            <button
              type="button"
              className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] bg-[var(--sunken)] px-4 py-2 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--line)]"
              onClick={() => contextInputRef.current?.click()}
            >
              <FileUp size={14} /> {t("assistant_import_context")}
            </button>
            <input
              ref={contextInputRef}
              type="file"
              accept=".txt,.md,.text"
              className="hidden"
              onChange={handleImportContext}
            />
          </div>

          <div className="h-px bg-[var(--line)]" />

          {/* Role / persona editor */}
          <Field label={t("assistant_role_label")} hint={t("assistant_role_hint")}>
            <textarea
              rows={4}
              value={prefs.customRole ?? DEFAULT_ROLE}
              onChange={(e) => updatePrefs({ customRole: e.target.value })}
              className="w-full resize-y rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--mint)] focus:bg-[var(--card)] focus:outline-none"
            />
            {prefs.customRole && prefs.customRole !== DEFAULT_ROLE && (
              <button
                type="button"
                onClick={() => updatePrefs({ customRole: undefined })}
                className="press mt-1.5 text-[12px] font-medium text-[var(--muted)] underline hover:text-[var(--ink)]"
              >
                {t("assistant_role_reset")}
              </button>
            )}
          </Field>

          <div className="h-px bg-[var(--line)]" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("assistant_logs_days")} hint={t("assistant_logs_days_hint")}>
              <NumberInput
                value={prefs.logsWindowDays}
                min={1}
                max={365}
                suffix={t("days")}
                disabled={prefs.includeAllLogs}
                onChange={(e) => updatePrefs({ logsWindowDays: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Field>

            <div className="space-y-3 pt-6">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefs.includeAllLogs}
                  onChange={(e) => updatePrefs({ includeAllLogs: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--line)] accent-[var(--mint)]"
                />
                <span className="text-[13px] font-medium text-[var(--ink)]">{t("assistant_all_logs")}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefs.includeCheckIns}
                  onChange={(e) => updatePrefs({ includeCheckIns: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--line)] accent-[var(--mint)]"
                />
                <span className="text-[13px] font-medium text-[var(--ink)]">{t("assistant_include_checkins")}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefs.includeMeasurements}
                  onChange={(e) => updatePrefs({ includeMeasurements: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--line)] accent-[var(--mint)]"
                />
                <span className="text-[13px] font-medium text-[var(--ink)]">{t("assistant_include_measurements")}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefs.includeLabs}
                  onChange={(e) => updatePrefs({ includeLabs: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--line)] accent-[var(--mint)]"
                />
                <span className="text-[13px] font-medium text-[var(--ink)]">{t("assistant_include_labs")}</span>
              </label>
            </div>
          </div>

          <p className="text-[12px] leading-snug text-[var(--faint)]">
            {customContext
              ? t("assistant_context_note_custom")
              : t("assistant_context_note", { model: aiConfig!.model })}
          </p>
        </Card>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--card)] p-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Bot size={28} className="text-[var(--faint)]" />
            <p className="text-[13px] text-[var(--faint)]">{t("assistant_empty")}</p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <div
                className={
                  msg.role === "user"
                    ? "max-w-[85%] rounded-[var(--r-inner)] bg-[var(--mint-soft)] px-3.5 py-2.5 text-[14px] text-[var(--mint-ink)]"
                    : "max-w-[85%] space-y-2 rounded-[var(--r-inner)] bg-[var(--sunken)] px-3.5 py-2.5 text-[14px] text-[var(--ink)]"
                }
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  renderMarkdown(msg.content)
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-3.5 py-2.5">
                <span className="text-[13px] text-[var(--faint)]">{t("assistant_thinking")}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-2.5 py-1.5"
            >
              {a.kind === "image" ? (
                <img
                  src={a.data}
                  alt={a.name}
                  className="h-7 w-7 rounded object-cover"
                />
              ) : (
                <Paperclip size={13} className="text-[var(--muted)]" />
              )}
              <span className="max-w-[120px] truncate text-[12px] text-[var(--ink)]">{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="text-[var(--faint)] hover:text-[var(--rose)]"
                aria-label={`Remove ${a.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachError && (
        <p className="mt-1.5 text-[12px] text-[var(--rose-ink)]">{attachError}</p>
      )}

      {/* Input row */}
      <div className="mt-2 flex gap-2">
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("assistant_attach")}
          className="press flex h-auto w-10 shrink-0 items-center justify-center rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <ImagePlus size={17} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.txt,.md,.csv,.json"
          multiple
          className="hidden"
          onChange={handleAttachFiles}
        />

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("assistant_placeholder")}
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3.5 py-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--mint)] focus:bg-[var(--card)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={(!input.trim() && attachments.length === 0) || sending}
          aria-label={t("assistant_send")}
          className="press flex h-auto w-10 shrink-0 items-center justify-center rounded-[var(--r-btn)] bg-[var(--mint)] text-[var(--on-accent)] shadow-[var(--shadow-pop)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--faint)]">
        {t("assistant_disclaimer")}
      </p>
    </div>
  );
}
