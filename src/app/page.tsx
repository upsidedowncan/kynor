// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OpenAI from "openai";
import { getSupabaseEnv, fetchChats, fetchMessages, createChat, insertMessage, upsertChatTitle } from "@/lib/supabaseRest";

type Role = "user" | "assistant" | "system";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

type ChatCompletionMessage = {
  role: Role;
  content: string;
};

function generateId(): string {
  const hasCrypto = typeof crypto !== "undefined";
  const c = hasCrypto ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes: Uint8Array = c?.getRandomValues ? c.getRandomValues(new Uint8Array(16)) : new Uint8Array(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function mapToChatMessages(items: Message[]): ChatCompletionMessage[] {
  return items.map((m) => ({ role: m.role as Role, content: m.content }));
}

function parseLabeledContent(text: string): { title?: string; short?: string; long?: string; keywords?: string; cta?: string } | null {
  const getBlock = (label: string) => {
    const pattern = new RegExp(`(?:^|\\r?\\n)\\s*${label}\\s*:\\s*([\\s\\S]*?)(?=(?:\\r?\\n)\\s*(?:Заголовок|Коротко|Развернуто|Ключевые слова|CTA)\\s*:|$)`, "i");
    const m = text.match(pattern);
    return m ? m[1].trim() : undefined;
  };
  const title = getBlock("Заголовок");
  const short = getBlock("Коротко");
  const long = getBlock("Развернуто");
  const keywords = getBlock("Ключевые слова");
  const cta = getBlock("CTA");
  if (title || short || long || keywords || cta) return { title, short, long, keywords, cta };
  return null;
}

function generateLoginCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function Topbar({ onToggleSidebar, onOpenSettings, theme, toggleTheme, onOpenAuthMenu, authCode, userMenuOpen, onToggleUserMenu, onCloseUserMenu }: {
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onOpenAuthMenu: () => void;
  authCode: string | null;
  userMenuOpen: boolean;
  onToggleUserMenu: (e: React.MouseEvent) => void;
  onCloseUserMenu: () => void;
}) {
  return (
    <div className="navbar bg-base-100/80 backdrop-blur supports-[backdrop-filter]:bg-base-100/70 border-b border-base-200 sticky top-0 z-40">
      <div className="flex-1">
        <button className="btn btn-ghost lg:hidden" onClick={onToggleSidebar} aria-label="Переключить сайдбар">
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
        <span className="btn btn-ghost text-lg font-medium">KynorAI</span>
      </div>
      <div className="flex-none gap-2">
        <button className="btn btn-ghost" onClick={toggleTheme} aria-label="Переключить тему">
          <span className="swap swap-rotate">
            <input type="checkbox" checked={theme === "dark"} readOnly />
            <span className="swap-on material-symbols-outlined">dark_mode</span>
            <span className="swap-off material-symbols-outlined">light_mode</span>
          </span>
        </button>
        {!authCode ? (
          <button className="btn btn-primary" onClick={onOpenAuthMenu} type="button">
            <span className="material-symbols-outlined mr-1">key</span>
            Войти
          </button>
        ) : (
          <div className={`dropdown dropdown-end ${userMenuOpen ? "dropdown-open" : ""}`}>
            <button tabIndex={0} className="btn btn-ghost" aria-label="Меню пользователя" onClick={onToggleUserMenu} type="button">
              <span className="material-symbols-outlined">account_circle</span>
              <span className="badge badge-primary badge-sm ml-2">{authCode}</span>
            </button>
            <ul tabIndex={0} className="dropdown-content z-[41] menu p-2 shadow bg-base-100 rounded-box w-56" onClick={onCloseUserMenu}>
              <li><button type="button" onClick={onOpenSettings}><span className="material-symbols-outlined mr-2">settings</span>Настройки</button></li>
              <li><button type="button" onClick={onCloseUserMenu}><span className="material-symbols-outlined mr-2">logout</span>Закрыть</button></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ chats, currentId, onSelect, onNewChat, open, onToggleContentMaker, contentMaker }: {
  chats: Chat[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  open: boolean;
  onToggleContentMaker: () => void;
  contentMaker: boolean;
}) {
  return (
    <aside className={`lg:static inset-y-0 left-0 z-30 w-72 h-full ${open ? "fixed translate-x-0" : "fixed -translate-x-full"} lg:translate-x-0 lg:block transition-transform duration-300`}>
      <div className="h-full bg-base-200 border-r border-base-300 flex flex-col">
        <div className="p-3 grid grid-cols-1 gap-2">
          <button className="btn btn-primary btn-block hover:scale-[1.02] transition-all" onClick={onNewChat}>Новый чат</button>
        </div>
        <ul className="menu px-2 flex-1 overflow-auto">
          <li className="menu-title">Недавние</li>
          {chats.filter(c => c.messages.length > 0).map((c) => (
            <li key={c.id}>
              <a className={`${currentId === c.id ? "active" : ""}`} onClick={() => onSelect(c.id)}>
                {c.title}
              </a>
          </li>
          ))}
        </ul>
        <div className="p-3 space-y-2">
          <div className="card bg-base-100 shadow hover:shadow-lg transition-all hover:scale-[1.01]">
            <div className="card-body p-4">
              <h3 className="card-title text-sm">Быстрые действия</h3>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-sm">Суммировать</button>
                <button className="btn btn-sm">Объяснить</button>
                <button className="btn btn-sm">Перевести</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MessageBubble({ m, onRegenerate, contentMaker }: { m: Message; onRegenerate: (id: string) => void; contentMaker: boolean }) {
  const isUser = m.role === "user";

  function CodeBlock({ code, lang }: { code: string; lang?: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {}
    }
    const label = lang && lang.trim().length > 0 ? lang : "code";
    return (
      <div className="my-2 border border-base-300 rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 text-xs bg-base-200 border-b border-base-300">
          <span className="opacity-70 select-none">{label}</span>
          <button className="btn btn-ghost btn-xs" onClick={copy} aria-label="Копировать">
            <span className="material-symbols-outlined">{copied ? "done" : "content_copy"}</span>
          </button>
        </div>
        <pre className={`overflow-x-auto text-sm p-3 bg-base-100 language-${label}`}>
          <code className={`language-${label} whitespace-pre`}>{code}</code>
        </pre>
      </div>
    );
  }

  function tryRenderContentMaker(text: string) {
    try {
      const data = JSON.parse(text) as { short?: string; long?: string; keywords?: string; title?: string; cta?: string };
      const entries: Array<{ k: string; v?: string }> = [
        { k: "Заголовок", v: data.title },
        { k: "Коротко", v: data.short },
        { k: "Развернуто", v: data.long },
        { k: "Ключевые слова", v: data.keywords },
        { k: "CTA", v: data.cta },
      ];
      return (
        <div className="space-y-2">
          {entries.filter(e => e.v && e.v.trim().length > 0).map((e, idx) => (
            <details key={idx} className="border border-base-300 rounded-md bg-base-100">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">{e.k}</summary>
              <div className="px-3 pb-3 whitespace-pre-wrap text-sm">
                <p>{e.v}</p>
              </div>
            </details>
          ))}
        </div>
      );
    } catch {
      const labeled = parseLabeledContent(text);
      if (labeled) {
        const entries: Array<{ k: string; v?: string }> = [
          { k: "Заголовок", v: labeled.title },
          { k: "Коротко", v: labeled.short },
          { k: "Развернуто", v: labeled.long },
          { k: "Ключевые слова", v: labeled.keywords },
          { k: "CTA", v: labeled.cta },
        ];
        return (
          <div className="space-y-2">
            {entries.filter(e => e.v && e.v.trim().length > 0).map((e, idx) => (
              <details key={idx} className="border border-base-300 rounded-md bg-base-100">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">{e.k}</summary>
                <div className="px-3 pb-3 whitespace-pre-wrap text-sm">
                  <p>{e.v}</p>
                </div>
              </details>
            ))}
          </div>
        );
      }
      return null;
    }
  }

  function renderMarkdown(text: string) {
    type Part = { type: "code" | "text"; content: string; lang?: string };
    const parts: Part[] = [];
    const fence = /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      const lang = (match[1] || "").trim();
      const code = match[2] ?? "";
      parts.push({ type: "code", content: code, lang });
      lastIndex = fence.lastIndex;
    }
    if (lastIndex < text.length) parts.push({ type: "text", content: text.slice(lastIndex) });

    const linkify = (t: string) => {
      const url = /(https?:\/\/[^\s)]+)|\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g;
      const nodes: React.ReactNode[] = [];
      let li = 0;
      let m: RegExpExecArray | null;
      while ((m = url.exec(t)) !== null) {
        if (m.index > li) nodes.push(t.slice(li, m.index));
        const href = m[3] || m[1];
        const label = m[2] || href;
        nodes.push(
          <a key={`${href}-${m.index}`} href={href} target="_blank" rel="noreferrer" className="underline">
            {label}
          </a>
        );
        li = url.lastIndex;
      }
      if (li < t.length) nodes.push(t.slice(li));
      return nodes;
    };

    return parts.map((p, i) =>
      p.type === "code" ? (
        <CodeBlock key={`code-${i}`} code={p.content} lang={p.lang} />
      ) : (
        <span key={`t-${i}`}>{linkify(p.content)}</span>
      )
    );
  }

  const contentMakerView = !isUser && contentMaker ? tryRenderContentMaker(m.content) : null;

  return (
    <div className={`w-full ${isUser ? "text-right" : "text-left"}`}>
      <div className={`inline-block ${isUser ? "bg-primary text-primary-content border-primary" : "bg-base-100 text-base-content border-base-300"} border rounded-lg px-3 py-2 max-w-[75ch] text-left whitespace-pre-wrap`}>
        {contentMakerView ?? renderMarkdown(m.content)}
      </div>
      {!isUser && (
        <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
          <button className="btn btn-ghost btn-xs p-1 h-6 min-h-6" onClick={() => onRegenerate(m.id)} aria-label="Пересоздать">
            <span className="material-symbols-outlined text-base">refresh</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ContentPanel({ open, doc, setDoc, onInsertMessage, onClose }: {
  open: boolean;
  doc: { title?: string; short?: string; long?: string; keywords?: string; cta?: string } | null;
  setDoc: (d: { title?: string; short?: string; long?: string; keywords?: string; cta?: string } | null) => void;
  onInsertMessage: () => void;
  onClose: () => void;
}) {
  if (!doc) return null;
  return (
    <>
      {/* Backdrop for mobile/tablet */}
      <div className={`fixed inset-0 bg-black/40 transition-opacity z-40 xl:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />
      {/* Slide-over on mobile; docked on xl */}
      <aside className={`fixed xl:static right-0 top-0 z-50 h-svh xl:h-full w-full sm:max-w-md xl:w-[380px] bg-base-100 border-l border-base-300 shadow-lg flex flex-col transition-transform ${open ? "translate-x-0" : "translate-x-full xl:translate-x-0"}`}>
        <div className="p-3 flex items-center justify-between border-b border-base-300">
          <h3 className="font-medium">Контент‑панель</h3>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(JSON.stringify(doc, null, 2))}>Copy JSON</button>
            <button className="btn btn-xs" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <div className="form-control">
            <label className="label"><span className="label-text">Заголовок</span></label>
            <input className="input input-bordered input-sm" value={doc.title || ""} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">Коротко</span></label>
            <textarea className="textarea textarea-bordered" rows={3} value={doc.short || ""} onChange={(e) => setDoc({ ...doc, short: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">Развернуто</span></label>
            <textarea className="textarea textarea-bordered" rows={8} value={doc.long || ""} onChange={(e) => setDoc({ ...doc, long: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label"><span className="label-text">Ключевые слова</span></label>
              <input className="input input-bordered input-sm" value={doc.keywords || ""} onChange={(e) => setDoc({ ...doc, keywords: e.target.value })} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">CTA</span></label>
              <input className="input input-bordered input-sm" value={doc.cta || ""} onChange={(e) => setDoc({ ...doc, cta: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="p-3 border-t border-base-300 flex gap-2 justify-end">
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(JSON.stringify(doc, null, 2))}>Копировать JSON</button>
          <button className="btn btn-primary btn-sm" onClick={onInsertMessage}>Вставить в чат</button>
        </div>
      </aside>
    </>
  );
}

function Composer({ onSend, contentMakerType, setContentMakerType, contentMaker, setContentMaker }: {
  onSend: (text: string) => void;
  contentMakerType: string;
  setContentMakerType: (s: string) => void;
  contentMaker: boolean;
  setContentMaker: (v: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [makerOpen, setMakerOpen] = useState(false);

  useEffect(() => {
    if (value.startsWith("/")) {
      const all = ["/summarize", "/explain", "/translate", "/code", "/research"];
      setSuggestions(all.filter((s) => s.startsWith(value)).slice(0, 5));
    } else {
      setSuggestions([]);
    }
  }, [value]);

  function handleSend() {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    setSuggestions([]);
  }

  const commandItems = [
    { label: "Суммировать", text: "/summarize " },
    { label: "Объяснить", text: "/explain " },
    { label: "Перевести", text: "/translate " },
    { label: "Код", text: "/code " },
    { label: "Исследовать", text: "/research " },
  ];

  const makerTypes = [
    "Статья/Пост",
    "Описание товара",
    "Твит/Короткий пост",
    "Сценарий видео",
    "Письмо/Рассылка",
  ];

  return (
    <div className="bg-base-100 border-t border-base-300">
      <div className="max-w-5xl xl:max-w-6xl mx-auto p-2 sm:p-3 space-y-2">
        {suggestions.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap">
            {suggestions.map((s) => (
              <button key={s} className="btn btn-xs" onClick={() => setValue(s + " ")}>{s}</button>
            ))}
          </div>
        )}
        <div className="join w-full items-stretch gap-1 sm:gap-0">
          {/* Slash commands dropdown (opens upward) */}
          <div className={`dropdown dropdown-top ${cmdOpen ? "dropdown-open" : ""} join-item z-40`}>
            <button className="btn btn-ghost h-10 min-h-10" onClick={() => { setCmdOpen(!cmdOpen); setMakerOpen(false); }} aria-label="Команды">
              <span className="text-lg font-semibold">/</span>
            </button>
            <ul className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-56">
              {commandItems.map(item => (
                <li key={item.label}><button type="button" onClick={() => { setValue(v => (v ? v + " " : "") + item.text); setCmdOpen(false); }}>{item.label}</button></li>
              ))}
            </ul>
          </div>

          {/* Content maker dropdown (opens upward) */}
          <div className={`dropdown dropdown-top ${makerOpen ? "dropdown-open" : ""} join-item z-40`}>
            <button className={`btn h-10 min-h-10 ${contentMaker ? "btn-accent" : "btn-ghost"}`} onClick={() => { setMakerOpen(!makerOpen); setCmdOpen(false); }} aria-label="Контент‑мейкер">
              <span className="material-symbols-outlined">draw</span>
            </button>
            <ul className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-64">
              <li className="menu-title">Режим</li>
              <li><button type="button" onClick={() => { setContentMaker(!contentMaker); setMakerOpen(false); }}>{contentMaker ? "Отключить" : "Включить"}</button></li>
              <li className="menu-title mt-2">Тип</li>
              {makerTypes.map(t => (
                <li key={t}><button type="button" onClick={() => { setContentMaker(true); setContentMakerType(t); setMakerOpen(false); }}>{t}</button></li>
              ))}
            </ul>
          </div>

          <textarea
            className="textarea textarea-bordered join-item w-full resize-none leading-normal min-h-10 h-10"
            rows={1}
            placeholder="Напишите сообщение..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button className="btn btn-primary join-item h-10 min-h-10" onClick={handleSend} aria-label="Отправить">
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
        <p className="text-xs text-base-content/60">KynorAI может ошибаться. Проверяйте важные факты.</p>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose, theme, toggleTheme, model, setModel, onClear }: {
  open: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  model: string;
  setModel: (m: string) => void;
  onClear: () => void;
}) {
  return (
    <dialog className={`modal ${open ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-medium text-lg mb-2">Настройки</h3>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">Тема</span></label>
            <div className="join w-full">
              <button className={`btn join-item ${theme === "light" ? "btn-active" : ""}`} onClick={() => theme !== "light" && toggleTheme()}>
                <span className="material-symbols-outlined mr-1">light_mode</span>
                Светлая
              </button>
              <button className={`btn join-item ${theme === "dark" ? "btn-active" : ""}`} onClick={() => theme !== "dark" && toggleTheme()}>
                <span className="material-symbols-outlined mr-1">dark_mode</span>
                Тёмная
              </button>
            </div>
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">Модель (Groq)</span></label>
            <select className="select select-bordered" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="groq/compound">groq/compound · система · 131k контекст · 8k вывод</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant · 131k контекст · 131k вывод</option>
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile · 131k контекст · 32k вывод</option>
              <option value="groq/compound-mini">groq/compound-mini · система · 131k контекст · 8k вывод</option>
              <option value="qwen/qwen3-32b">qwen3-32b · 131k контекст · 40,960 вывод (preview)</option>
            </select>
          </div>
          <div className="form-control">
            <button className="btn btn-error" onClick={onClear}>
              <span className="material-symbols-outlined mr-1">delete</span>
              Очистить все чаты
            </button>
          </div>
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}><button>close</button></form>
    </dialog>
  );
}

function ChatWindow({ messages, typing, onRegenerate, contentMaker }: { messages: Message[]; typing: boolean; onRegenerate: (id: string) => void; contentMaker: boolean }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    // Trigger Prism highlighting on new content
    try {
      // @ts-ignore Prism from window
      const Prism = (window as any).Prism;
      if (Prism && containerRef.current) {
        Prism.highlightAllUnder(containerRef.current);
      }
    } catch {}
  }, [messages, typing]);

  if (messages.length === 0) {
    const prompts = [
      "Что у тебя на уме сегодня?",
      "О чём хочешь поговорить?",
      "С чего начнём — идея, план или код?",
      "Опиши задачу — я помогу её решить.",
    ];
    const pick = prompts[Math.floor(Math.random() * prompts.length)];
    return (
      <div className="h-full overflow-y-auto px-2 sm:px-4" ref={containerRef}>
        <div className="h-full max-w-3xl mx-auto grid place-items-center">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-medium">{pick}</h2>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "Суммируй эту статью",
                "Придумай идею поста",
                "Объясни этот фрагмент кода",
                "Сделай план видео",
              ].map((s) => (
                <span key={s} className="badge badge-outline">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-2 sm:px-4" ref={containerRef}>
      <div className="max-w-5xl xl:max-w-6xl mx-auto py-3 sm:py-4 space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} onRegenerate={onRegenerate} contentMaker={contentMaker} />
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2">
              <span className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:300ms]"></span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("kynor_theme");
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Default to groq/compound as requested; we will fallback at call time if unsupported
  const [model, setModel] = useState("groq/compound");
  const [contentMaker, setContentMaker] = useState<boolean>(false);
  const [contentMakerType, setContentMakerType] = useState<string>("Статья/Пост");
  const [panelDoc, setPanelDoc] = useState<{ title?: string; short?: string; long?: string; keywords?: string; cta?: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"generate" | "login">("generate");
  const [tempCode, setTempCode] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [didInitNewChat, setDidInitNewChat] = useState(false);
  const sbEnv = useMemo(() => getSupabaseEnv(), []);

  useEffect(() => {
    const saved = localStorage.getItem("kynor_auth_code");
    if (saved) setAuthCode(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("kynor_theme", theme);
    }
  }, [theme]);

  function handleToggleUserMenu(e: React.MouseEvent) {
    e.stopPropagation();
    setUserMenuOpen(v => !v);
  }
  function handleCloseUserMenu() {
    setUserMenuOpen(false);
  }

  // close menu when clicking any area below navbar
  function handleMainClick() {
    if (userMenuOpen) setUserMenuOpen(false);
  }

  function openAuthMenu() {
    setAuthMode("generate");
    setTempCode(generateLoginCode());
    setAuthOpen(true);
  }

  function saveCurrentCode() {
    if (!tempCode) return;
    localStorage.setItem("kynor_auth_code", tempCode);
    setAuthCode(tempCode);
    setAuthOpen(false);
  }

  function logoutAnon() {
    localStorage.removeItem("kynor_auth_code");
    setAuthCode(null);
    setAuthOpen(false);
  }

  const [chats, setChats] = useState<Chat[]>([]);
  // currentId объявлен выше в файле; дублирование удалено

  function buildContentMakerPrompt(userText: string): string {
    return `Ты — помощник контент-мейкера. Тип контента: ${contentMakerType}.
СТРОГО СЛЕДУЙ ФОРМАТУ: ответ ТОЛЬКО JSON без пояснений и текста вокруг.
Структура:
{"short":"короткий ответ (1–2 предложения)","long":"развернутый ответ (3–6 абзацев)","keywords":"1-3 слова","title":"кликбейтный заголовок","cta":"призыв к действию в 1 фразе"}
Никаких префиксов (например, "Заголовок:"), никаких markdown. Только JSON.
Запрос: ${userText}`;
  }

  function formatContentMaker(jsonText: string): string {
    try {
      const data = JSON.parse(jsonText) as { short?: string; long?: string; keywords?: string; title?: string; cta?: string };
      const out: string[] = [];
      if (data.title) out.push(`Заголовок: ${data.title}`);
      if (data.short) out.push(`Коротко: ${data.short}`);
      if (data.long) out.push(`Развернуто:\n${data.long}`);
      if (data.keywords) out.push(`Ключевые слова: ${data.keywords}`);
      if (data.cta) out.push(`CTA: ${data.cta}`);
      return out.join("\n\n");
    } catch {
      return jsonText;
    }
  }

  function toDoc(text: string): { title?: string; short?: string; long?: string; keywords?: string; cta?: string } | null {
    try { return JSON.parse(text); } catch { return null; }
  }

  // ensure we have a starting chat selected
  useEffect(() => {
    if (!currentId && chats.length > 0) {
      setCurrentId(chats[0].id);
    }
  }, [currentId, chats]);

  // Load existing chats/messages from Supabase (history)
  useEffect(() => {
    (async () => {
      if (!sbEnv) return;
      try {
        const dbChats = await fetchChats(sbEnv);
        const loaded: Chat[] = [];
        for (const ch of dbChats) {
          const msgs = await fetchMessages(sbEnv, ch.id);
          loaded.push({ id: ch.id, title: ch.title, messages: msgs.map(m => ({ id: m.id, role: m.role, content: m.content })) });
        }
        setChats(loaded);
      } catch (e) {
        console.warn("Supabase load error:", e);
      }
    })();
  }, [sbEnv]);

  // Start with a fresh chat only if истории нет
  useEffect(() => {
    if (!didInitNewChat && chats.length === 0) {
      handleNewChat();
      setDidInitNewChat(true);
    }
  }, [didInitNewChat, chats.length]);

  async function persistIfConfigured(chatId: string, role: "user" | "assistant", content: string, maybeTitle?: string, idOverride?: string) {
    if (!sbEnv) return;
    const msgId = idOverride ?? generateId();
    try {
      // Always ensure chat exists (idempotent via Prefer: ignore-duplicates in client)
      await createChat(sbEnv, { id: chatId, title: maybeTitle || "Новый чат" });
      await insertMessage(sbEnv, { id: msgId, chat_id: chatId, role, content });
      if (maybeTitle) { try { await upsertChatTitle(sbEnv, chatId, maybeTitle); } catch {} }
    } catch (e) {
      console.warn("Supabase save error:", e);
    }
  }

  const messages = useMemo(() => chats.find(c => c.id === currentId)?.messages ?? [], [chats, currentId]);
  const [typing, setTyping] = useState(false);

  const openai = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY as unknown as string;
    return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1", dangerouslyAllowBrowser: true });
  }, []);

  async function handleSend(text: string) {
    let targetId = currentId;
    const initialTitle = text.slice(0, 48) || "Новый чат";

    if (!targetId) {
      targetId = generateId();
      setCurrentId(targetId);
    }
    if (!targetId) return;

    const user: Message = { id: generateId(), role: "user", content: text };

    // Single functional update: create chat if missing and append user message
    setChats(prev => {
      const idx = prev.findIndex(c => c.id === targetId);
      if (idx === -1) {
        return [{ id: targetId!, title: initialTitle, messages: [user] }, ...prev];
      }
      const chat = prev[idx];
      const updated: Chat = { ...chat, title: chat.title === "Новый чат" ? initialTitle : chat.title, messages: [...chat.messages, user] };
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });

    if (sbEnv) void persistIfConfigured(targetId, "user", text, initialTitle, user.id);

    setTyping(true);
    try {
      const SUPPORTED = new Set(["llama-3.1-8b-instant","llama-3.3-70b-versatile","openai/gpt-oss-20b","openai/gpt-oss-120b"]);
      const chosenModel = SUPPORTED.has(model) ? model : (model.startsWith("groq/") ? "openai/gpt-oss-20b" : model);
      const chatMsgs = (chats.find(c => c.id === targetId)?.messages ?? []).concat(user);
      const convo: ChatCompletionMessage[] = mapToChatMessages(chatMsgs);
      const finalMessages: ChatCompletionMessage[] = contentMaker ? [{ role: "system", content: buildContentMakerPrompt(text) }] : convo;
      const completion = await openai.chat.completions.create({ model: chosenModel, messages: finalMessages, temperature: 0.7 });
      const raw = completion.choices?.[0]?.message?.content || "(no response)";
      const content = contentMaker ? formatContentMaker(raw) : raw;
      const assistant: Message = { id: generateId(), role: "assistant", content };
      setChats(prev => {
        const idx = prev.findIndex(c => c.id === targetId);
        if (idx === -1) return prev; // should not happen
        const chat = prev[idx];
        const updated: Chat = { ...chat, messages: [...chat.messages, assistant] };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });
      if (sbEnv) void persistIfConfigured(targetId, "assistant", content, undefined, assistant.id);
      if (contentMaker) { const doc = toDoc(raw) || toDoc(content); setPanelDoc(doc || { title: "", short: "", long: "", keywords: "", cta: "" }); setPanelOpen(true); }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Ошибка запроса к модели.";
      const assistant: Message = { id: generateId(), role: "assistant", content: errorMessage };
      setChats(prev => {
        const idx = prev.findIndex(c => c.id === targetId);
        if (idx === -1) return prev;
        const chat = prev[idx];
        const updated: Chat = { ...chat, messages: [...chat.messages, assistant] };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });
      if (sbEnv) void persistIfConfigured(targetId, "assistant", errorMessage, undefined, assistant.id);
    } finally { setTyping(false); }
  }

  function handleNewChat() {
    const id = generateId();
    setChats(prev => [{ id, title: "Новый чат", messages: [] }, ...prev]);
    setCurrentId(id);
    // Не сохраняем пустой чат в Supabase — создадим при первом сообщении
  }

  function handleSelect(id: string) {
    setCurrentId(id);
    setSidebarOpen(false);
  }

  function handleRegenerate(): void {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    void handleSend(lastUser.content);
  }

  function handleClear() {
    setChats([]);
    setSettingsOpen(false);
    setCurrentId(null);
  }

  return (
    <div className="flex flex-col h-svh bg-base-100 text-base-content" data-theme={theme} onClick={handleMainClick}>
      <Topbar
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        toggleTheme={() => setTheme(t => t === "light" ? "dark" : "light")}
        onOpenAuthMenu={openAuthMenu}
        authCode={authCode}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={handleToggleUserMenu}
        onCloseUserMenu={handleCloseUserMenu}
      />

      <div className="flex-1 grid grid-cols-[auto_1fr_auto] h-full overflow-hidden">
        <Sidebar chats={chats} currentId={currentId} onSelect={handleSelect} onNewChat={handleNewChat} open={sidebarOpen} onToggleContentMaker={() => setContentMaker(v => !v)} contentMaker={contentMaker} />
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ChatWindow messages={messages} typing={typing} onRegenerate={handleRegenerate} contentMaker={contentMaker} />
          </div>
          <div className="border-t border-base-300 bg-base-100 shrink-0">
            <Composer onSend={handleSend} contentMaker={contentMaker} setContentMaker={setContentMaker} contentMakerType={contentMakerType} setContentMakerType={setContentMakerType} />
          </div>
        </div>
        {contentMaker && (
          <ContentPanel open={panelOpen} doc={panelDoc} setDoc={setPanelDoc} onInsertMessage={() => { if (panelDoc) handleSend(JSON.stringify(panelDoc)); setPanelOpen(false); }} onClose={() => setPanelOpen(false)} />
        )}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} toggleTheme={() => setTheme(t => t === "light" ? "dark" : "light")} model={model} setModel={setModel} onClear={handleClear} />

      {/* Auth Modal */}
      <dialog className={`modal ${authOpen ? "modal-open" : ""}`}>
        <div className="modal-box">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-lg">Анонимная аутентификация</h3>
            <div className="join">
              <button className={`btn btn-xs join-item ${authMode === "generate" ? "btn-active" : ""}`} onClick={() => setAuthMode("generate")}>Получить код</button>
              <button className={`btn btn-xs join-item ${authMode === "login" ? "btn-active" : ""}`} onClick={() => setAuthMode("login")}>Ввести код</button>
            </div>
          </div>
          {authMode === "generate" ? (
            <div className="space-y-3">
              <p className="text-sm">Нажмите, чтобы сгенерировать 6‑значный код (буквы разного регистра и цифры). Сохраните его — с ним вы будете входить в аккаунт.</p>
              <div className="flex items-center gap-2">
                <input className="input input-bordered w-full" value={tempCode} readOnly />
                <button className="btn" onClick={() => setTempCode(generateLoginCode())}><span className="material-symbols-outlined">refresh</span></button>
                <button className="btn" onClick={() => navigator.clipboard.writeText(tempCode)}><span className="material-symbols-outlined">content_copy</span></button>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost" onClick={() => setAuthOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveCurrentCode}>Сохранить код</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Введите ваш 6‑значный код для входа.</p>
              <input className="input input-bordered w-full" value={tempCode} onChange={(e) => setTempCode(e.target.value)} maxLength={6} />
              <div className="flex justify-between items-center">
                <button className="btn btn-error btn-sm" onClick={logoutAnon}>Выйти</button>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={() => setAuthOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveCurrentCode}>Войти</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <form method="dialog" className="modal-backdrop" onClick={() => setAuthOpen(false)}><button>close</button></form>
      </dialog>
    </div>
  );
}