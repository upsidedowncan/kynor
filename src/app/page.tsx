// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import OpenAI from "openai";

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

function Topbar({ onToggleSidebar, onOpenSettings, theme, toggleTheme }: {
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
  return (
    <div className="navbar bg-base-100/80 backdrop-blur supports-[backdrop-filter]:bg-base-100/70 border-b border-base-200 sticky top-0 z-40">
      <div className="flex-1">
        <button className="btn btn-ghost lg:hidden" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
        <span className="btn btn-ghost text-lg font-medium">KynorAI</span>
      </div>
      <div className="flex-none gap-2">
        <button className="btn btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
          <span className="swap swap-rotate">
            <input type="checkbox" checked={theme === "dark"} readOnly />
            <span className="swap-on material-symbols-outlined">dark_mode</span>
            <span className="swap-off material-symbols-outlined">light_mode</span>
          </span>
        </button>
        <button className="btn btn-ghost" onClick={onOpenSettings} aria-label="Open settings">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className="avatar">
          <div className="w-8 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
            <img src="/vercel.svg" alt="avatar" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ chats, currentId, onSelect, onNewChat, open }: {
  chats: Chat[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  open: boolean;
}) {
  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-72 transform lg:transform-none transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="h-full bg-base-200 border-r border-base-300 flex flex-col">
        <div className="p-3">
          <button className="btn btn-primary btn-block hover:scale-[1.02] transition-all" onClick={onNewChat}>New Chat</button>
        </div>
        <ul className="menu px-2 flex-1 overflow-auto">
          <li className="menu-title">Recent</li>
          {chats.map((c) => (
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
              <h3 className="card-title text-sm">Quick actions</h3>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-sm">Summarize</button>
                <button className="btn btn-sm">Explain</button>
                <button className="btn btn-sm">Translate</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MessageBubble({ m, onRegenerate }: { m: Message; onRegenerate: (id: string) => void }) {
  const isUser = m.role === "user";
  function renderMarkdown(text: string) {
    const parts: Array<{ type: "code" | "text"; content: string }> = [];
    const fence = /```([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: "code", content: match[1].trim() });
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
          <a key={`${href}-${m.index}`} href={href} target="_blank" rel="noreferrer" className="link">
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
        <pre key={i} className="mt-2 mb-1 overflow-x-auto">
          <code className="kbd kbd-sm whitespace-pre">{p.content}</code>
        </pre>
      ) : (
        <span key={i}>{linkify(p.content)}</span>
      )
    );
  }
  return (
    <div className={`chat ${isUser ? "chat-end" : "chat-start"}`}>
      <div className="chat-image avatar">
        <div className="w-8 rounded-full">
          <img alt={isUser ? "You" : "AI"} src={isUser ? "/window.svg" : "/globe.svg"} />
        </div>
      </div>
      <div className={`chat-bubble ${isUser ? "chat-bubble-primary" : ""} max-w-[75ch] whitespace-pre-wrap`}>
        {renderMarkdown(m.content)}
      </div>
      {!isUser && (
        <div className="chat-footer mt-1">
          <button className="btn btn-ghost btn-xs" onClick={() => onRegenerate(m.id)}>
            <span className="material-symbols-outlined text-base align-middle">refresh</span>
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

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

  return (
    <div className="bg-base-100 border-t border-base-300">
      <div className="max-w-5xl xl:max-w-6xl mx-auto p-2 sm:p-3">
        {suggestions.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap">
            {suggestions.map((s) => (
              <button key={s} className="btn btn-xs" onClick={() => setValue(s + " ")}>{s}</button>
            ))}
          </div>
        )}
        <div className="join w-full items-stretch">
          <textarea
            className="textarea textarea-bordered join-item w-full resize-none leading-normal min-h-10 h-10"
            rows={1}
            placeholder="Message KynorAI..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button className="btn btn-primary join-item h-10 min-h-10" onClick={handleSend} aria-label="Send">
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
        <p className="text-xs text-base-content/60 mt-2">KynorAI can make mistakes. Check important info.</p>
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
        <h3 className="font-medium text-lg mb-2">Settings</h3>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">Theme</span></label>
            <div className="join w-full">
              <button className={`btn join-item ${theme === "light" ? "btn-active" : ""}`} onClick={() => theme !== "light" && toggleTheme()}>
                <span className="material-symbols-outlined mr-1">light_mode</span>
                Light
              </button>
              <button className={`btn join-item ${theme === "dark" ? "btn-active" : ""}`} onClick={() => theme !== "dark" && toggleTheme()}>
                <span className="material-symbols-outlined mr-1">dark_mode</span>
                Dark
              </button>
            </div>
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">Model (Groq)</span></label>
            <select className="select select-bordered" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant · 131k ctx · 131k out</option>
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile · 131k ctx · 32k out</option>
              <option value="groq/compound">groq/compound · system · 131k ctx · 8k out</option>
              <option value="groq/compound-mini">groq/compound-mini · system · 131k ctx · 8k out</option>
              <option value="qwen/qwen3-32b">qwen3-32b · 131k ctx · 40,960 out (preview)</option>
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
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}><button>close</button></form>
    </dialog>
  );
}

function ChatWindow({ messages, typing, onRegenerate }: { messages: Message[]; typing: boolean; onRegenerate: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-auto px-2 sm:px-4">
      <div className="max-w-5xl xl:max-w-6xl mx-auto py-3 sm:py-4 space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} onRegenerate={onRegenerate} />
        ))}
        {typing && (
          <div className="chat chat-start">
            <div className="chat-image avatar">
              <div className="w-8 rounded-full"><img alt="AI" src="/globe.svg" /></div>
            </div>
            <div className="chat-bubble">
              <span className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-2 h-2 bg-base-content/60 rounded-full animate-bounce [animation-delay:300ms]"></span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [model, setModel] = useState("llama-3.1-8b-instant");

  const [chats, setChats] = useState<Chat[]>([{
    id: "c1",
    title: "Welcome",
    messages: [
      { id: "m1", role: "assistant", content: "Привет! Я KynorAI. Чем помочь сегодня?" }
    ]
  }]);
  const currentId = chats[0]?.id ?? null;
  const messages = useMemo(() => chats.find(c => c.id === currentId)?.messages ?? [], [chats, currentId]);
  const [typing, setTyping] = useState(false);

  const openai = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY as unknown as string;
    return new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
      dangerouslyAllowBrowser: true,
    });
  }, []);

  async function handleSend(text: string) {
    const user: Message = { id: generateId(), role: "user", content: text };
    setChats(prev => prev.map(c => c.id === currentId ? { ...c, title: c.title === "Welcome" ? text.slice(0, 48) || "New chat" : c.title, messages: [...c.messages, user] } : c));
    setTyping(true);
    try {
      const SUPPORTED = new Set(["llama-3.1-8b-instant","llama-3.3-70b-versatile","openai/gpt-oss-20b","openai/gpt-oss-120b"]);
      const chosenModel = SUPPORTED.has(model) ? model : "openai/gpt-oss-20b";
      const completion = await openai.chat.completions.create({
        model: chosenModel,
        messages: mapToChatMessages([...messages, user]),
        temperature: 0.7,
      });
      const content: string = completion.choices?.[0]?.message?.content || "(no response)";
      const assistant: Message = { id: generateId(), role: "assistant", content };
      setChats(prev => prev.map(c => c.id === currentId ? { ...c, messages: [...c.messages, assistant] } : c));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Ошибка запроса к модели.";
      const assistant: Message = { id: generateId(), role: "assistant", content: errorMessage };
      setChats(prev => prev.map(c => c.id === currentId ? { ...c, messages: [...c.messages, assistant] } : c));
    } finally {
      setTyping(false);
    }
  }

  function handleNewChat() {
    const id = generateId();
    setChats(prev => [{ id, title: "New chat", messages: [] }, ...prev]);
  }

  function handleSelect(): void {
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
  }

  return (
    <div className="flex flex-col min-h-svh bg-base-100 text-base-content" data-theme={theme}>
      <Topbar onToggleSidebar={() => setSidebarOpen(v => !v)} onOpenSettings={() => setSettingsOpen(true)} theme={theme} toggleTheme={() => setTheme(t => t === "light" ? "dark" : "light")} />

      <div className="flex-1 flex">
        <Sidebar chats={chats} currentId={currentId} onSelect={handleSelect} onNewChat={handleNewChat} open={sidebarOpen} />
        <main className="flex-1 flex flex-col">
          <ChatWindow messages={messages} typing={typing} onRegenerate={handleRegenerate} />
          <div className="sticky bottom-0 border-t border-base-300 bg-base-100">
            <Composer onSend={handleSend} />
          </div>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} toggleTheme={() => setTheme(t => t === "light" ? "dark" : "light")} model={model} setModel={setModel} onClear={handleClear} />
    </div>
  );
}