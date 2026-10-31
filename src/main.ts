import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { THINKING_LABELS, thinkingDefault, type ChatMessage, type ModelInfo } from "./models";
import "./style.css";

type ModelCategory = "All" | "Featured" | "Gemini" | "Live" | "Images" | "Video" | "Audio" | "Music" | "Agents" | "Gemma";
type AppState = {
  hasKey: boolean;
  keyBusy: boolean;
  models: ModelInfo[];
  selectedModelId: string;
  thinking: string;
  query: string;
  category: ModelCategory;
  pickerOpen: boolean;
  favorites: Set<string>;
  messages: ChatMessage[];
  busy: boolean;
  activeRequestId: string;
  keyError: string;
  appError: string;
  settingsOpen: boolean;
  modelLoadBusy: boolean;
};

const state: AppState = {
  hasKey: false, keyBusy: false, models: [], selectedModelId: "gemini-3.8-flash", thinking: "medium",
  query: "", category: "Featured", pickerOpen: false, favorites: new Set(), messages: [], busy: false,
  activeRequestId: "", keyError: "", appError: "", settingsOpen: false, modelLoadBusy: false,
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const categories: ModelCategory[] = ["All", "Featured", "Gemini", "Live", "Images", "Video", "Audio", "Music", "Agents", "Gemma"];
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
const number = (value: number | null) => value ? new Intl.NumberFormat("en-US").format(value) : "—";
const currentModel = () => state.models.find((m) => m.id === state.selectedModelId) ?? state.models[0];

function svg(name: string, size = 18): string {
  const paths: Record<string, string> = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    playground: '<path d="M4 5h16v14H4z"/><path d="m8 15 3-3 2 2 3-4"/><path d="M8 8h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    dashboard: '<path d="M3 13a9 9 0 1 1 18 0"/><path d="M12 13 17 8M5 18h14"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.6a8 8 0 0 1-1.5.9l-.2 1.5h-2.4l-.3-1.5a8 8 0 0 1-1.6-.6l-1.3.8-1.7-1.7.8-1.3a8 8 0 0 1-.6-1.6L5.8 14v-2.4l1.5-.3a8 8 0 0 1 .6-1.6l-.8-1.3 1.7-1.7 1.3.8a8 8 0 0 1 1.6-.6L12 5.4h2.4l.3 1.5a8 8 0 0 1 1.6.6l1.3-.8 1.7 1.7-.8 1.3a8 8 0 0 1 .6 1.6l1.5.3V14z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 2 2-2 2-2-2-3 3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.8 7.4-4.6M8.3 13.2l7.4 4.6"/>',
    tune: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    up: '<path d="m7 14 5-5 5 5"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/>',
    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    sparkle: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    attachment: '<path d="m8 12.5 6.8-6.8a3.5 3.5 0 0 1 5 5L10 20.5a5 5 0 0 1-7-7L13.2 3.3"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

function renderKeyScreen(): void {
  app.innerHTML = `
    <div class="key-screen">
      <div class="key-card">
        <div class="brand-mark"><span class="gemini-mark">✦</span><span>Google AI Studio</span></div>
        <div class="key-illustration"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="gemini-large">✦</div></div>
        <h1>Connect your Gemini API key</h1>
        <p class="key-lede">Use your own Google AI Studio key to generate responses with eligible Gemini models.</p>
        <form id="key-form" class="key-form">
          <label for="api-key">Gemini API key</label>
          <div class="key-input-wrap"><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key" required minlength="10"><button type="button" class="icon-button" id="toggle-key" aria-label="Show API key">◉</button></div>
          <div class="key-error" id="key-error">${esc(state.keyError)}</div>
          <button class="primary-button key-submit" type="submit" ${state.keyBusy ? "disabled" : ""}>${state.keyBusy ? '<span class="spinner"></span> Checking key…' : "Continue"}</button>
        </form>
        <div class="privacy-note">${svg("key", 15)} <span>Your key is stored in Windows Credential Manager. It is not saved in browser storage or sent to this app's developer.</span></div>
        <a class="external-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a Gemini API key ↗</a>
      </div>
    </div>`;
  document.querySelector<HTMLFormElement>("#key-form")?.addEventListener("submit", onKeySubmit);
  document.querySelector<HTMLButtonElement>("#toggle-key")?.addEventListener("click", () => {
    const input = document.querySelector<HTMLInputElement>("#api-key");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });
}

function renderShell(): void {
  const model = currentModel();
  const modelName = model?.name ?? "Gemini";
  const thinkingOptions = model?.thinkingLevels ?? [];
  app.innerHTML = `
  <div class="window-frame">
    <header class="titlebar" data-tauri-drag-region>
      <div class="titlebar-brand" data-tauri-drag-region><span class="mini-gem">✦</span><span data-tauri-drag-region>Google AI Studio</span></div>
      <div class="window-actions">
        <button class="window-action" id="win-min" aria-label="Minimize">−</button>
        <button class="window-action" id="win-max" aria-label="Maximize">□</button>
        <button class="window-action close-window" id="win-close" aria-label="Close">×</button>
      </div>
    </header>
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-head"><span class="sidebar-brand">Google AI Studio</span><button class="plain-icon" aria-label="Collapse sidebar">${svg("menu", 18)}</button></div>
        <nav class="nav-groups">
          <div class="nav-label">EXPLORE</div>
          <button class="nav-item active">${svg("playground", 17)}<span>Playground</span></button>
          <button class="nav-item">${svg("history", 17)}<span>History</span></button>
          <div class="nav-label">BUILD</div>
          <button class="nav-item">${svg("plus", 17)}<span>New app</span></button>
          <button class="nav-item">${svg("grid", 17)}<span>My apps</span></button>
          <button class="nav-item">${svg("dashboard", 17)}<span>Gallery</span></button>
          <div class="nav-label">MANAGE</div>
          <button class="nav-item">${svg("dashboard", 17)}<span>Dashboard</span><span class="nav-arrow">›</span></button>
          <button class="nav-item">${svg("book", 17)}<span>Documentation</span><span class="nav-arrow">›</span></button>
        </nav>
        <div class="sidebar-bottom">
          <div class="promo-card"><div class="promo-title">Unlock Gemini 4 Argon</div><div>Access to higher quota, Pro models, and more.</div></div>
          <div class="sidebar-tools">
            <button class="small-tool" title="Notifications">${svg("bell", 17)}</button>
            <button class="small-tool" id="settings-key" title="API key settings">${svg("settings", 17)}</button>
            <button class="small-tool" title="Search">${svg("search", 17)}</button>
            <button class="small-tool" id="settings-key-2" title="Manage API key">${svg("key", 17)}</button>
          </div>
          <button class="profile-row" id="profile-key"><span class="avatar">A</span><span class="profile-email">Gemini API connected</span><span class="profile-more">···</span></button>
        </div>
      </aside>

      <main class="workspace">
        <div class="workspace-toolbar"><div class="workspace-title">Playground</div><div class="toolbar-actions"><button class="plain-icon" title="Share">${svg("share", 18)}</button><button class="plain-icon" title="Run options">${svg("tune", 18)}</button><button class="plain-icon" title="New session">${svg("plus", 19)}</button><button class="plain-icon" title="More">${svg("dots", 19)}</button></div></div>
        <section class="workspace-content" id="workspace-content">
          <div class="welcome" id="welcome-view">
            <div class="welcome-copy">
              <h1>Start building with<br><span id="welcome-model">${esc(modelName)}</span></h1>
              <p class="welcome-description">Fast, frontier-class multimodal intelligence built for responsive apps and high-throughput workflows.</p>
              <div class="example-prompts"><button class="example-prompt">Turn a hand-drawn sketch into a live UI</button><button class="example-prompt">Extract structured JSON from messy receipts</button><button class="example-prompt">Compare live flight &amp; weather disruptions</button></div>
            </div>
            <div class="welcome-art">
              <div class="preview-glow"><div class="finance-card"><div class="finance-number">$181<span>.69</span></div><div class="finance-caption">NASDAQ <span>+5.1%</span></div><svg viewBox="0 0 310 70" class="finance-chart"><path d="M4 50 C20 37 26 44 35 29 S55 44 67 38 81 51 94 42 110 54 123 35 136 45 149 29 164 38 177 20 195 42 210 34 225 47 240 29 255 36 275 8 295 17" fill="none" stroke="#62d78b" stroke-width="2.5"/><path d="M4 50 C20 37 26 44 35 29 S55 44 67 38 81 51 94 42 110 54 123 35 136 45 149 29 164 38 177 20 195 42 210 34 225 47 240 29 255 36 275 8 295 17 L295 68 4 68Z" fill="url(#chartFill)" opacity=".22"/></svg><div class="market-pill">$510.13 <span>↗</span></div><div class="finance-label">Financial Research Agent</div></div></div>
              <div class="preview-small-row"><div class="preview-small city-preview"><span>The Urban Life</span><b>Interactive<br>Annual Report</b></div><div class="preview-small map-preview"><span>World explorer</span><b>Dinosaur Fossil<br>Explorer</b></div></div>
            </div>
          </div>
          <div class="conversation ${state.messages.length ? "visible" : ""}" id="conversation-view">${renderMessages()}</div>
        </section>
        <section class="composer-wrap">
          <div class="composer" id="composer">
            <textarea id="prompt-input" rows="1" placeholder="Start typing a prompt to see what our models can do" ${state.busy ? "disabled" : ""}></textarea>
            <div class="composer-toolbar">
              <div class="composer-left-tools"><button class="round-tool" title="Attach files">${svg("plus", 18)}</button><button class="round-tool" title="Prompt tools">${svg("tune", 17)}</button><button class="tools-chip">${svg("grid", 16)} Tools</button><button class="grounding-chip">${googleG()} Grounding with Google Search <span>×</span></button></div>
              <div class="composer-right-tools"><button class="round-tool" title="Voice input">${svg("mic", 17)}</button><button class="run-button" id="run-button" ${state.busy ? "disabled" : ""}>${state.busy ? "Generating…" : "Run  Ctrl ↵"}</button>${state.busy ? `<button class="stop-button" id="stop-button" title="Stop generation">${svg("stop", 15)}</button>` : ""}</div>
            </div>
          </div>
          <div class="composer-footnote">Gemini can make mistakes, so double-check it. <button id="free-tier-info">Free-tier usage limits apply.</button></div>
        </section>
      </main>

      <aside class="settings-panel">
        <div class="settings-top"><span>Run settings</span><div><button class="plain-icon code-button" title="Get code">‹ › <span>Get code</span></button><button class="plain-icon" title="More">${svg("dots", 17)}</button><button class="plain-icon" title="Close panel">${svg("close", 17)}</button></div></div>
        <div class="settings-scroll">
          <button class="model-summary-card" id="open-model-picker"><div class="model-summary-name">${esc(modelName)}</div><div class="model-summary-id">${esc(model?.id ?? "Select a model")}</div><p>${esc(model?.description ?? "Choose a free-tier Gemini model to begin.")}</p><div class="summary-badge"><span class="green-dot"></span> Free-tier eligible</div><div class="model-card-change">Change model ${svg("chevron", 14)}</div></button>
          <div class="system-card"><div class="setting-card-title">System instructions</div><p>Optional tone and style instructions for the model</p><textarea placeholder="Add system instructions…" disabled></textarea></div>
          <div class="thinking-setting"><div class="section-title">Thinking level</div>${thinkingOptions.length ? `<select id="thinking-select">${thinkingOptions.map((level) => `<option value="${level}" ${level === state.thinking ? "selected" : ""}>${THINKING_LABELS[level] ?? level}</option>`).join("")}</select>` : `<div class="unsupported-thinking">Not exposed for this model</div>`}</div>
          <div class="settings-divider"></div>
          <div class="tools-head"><span>Tools</span>${svg("up", 15)}</div>
          <div class="setting-toggle-row"><span>Structured outputs</span><span class="edit-text">Edit</span><button class="toggle" aria-label="Structured outputs"><i></i></button></div>
          <div class="setting-toggle-row"><span>Code execution</span><span class="spacer"></span><button class="toggle" aria-label="Code execution"><i></i></button></div>
          <div class="setting-toggle-row"><span>Function calling</span><span class="edit-text">Edit</span><button class="toggle" aria-label="Function calling"><i></i></button></div>
          <div class="setting-toggle-row tall"><span>Grounding with Google Search<small>Source: <b class="google-g">G</b> Google Search</small></span><button class="toggle on" aria-label="Grounding with Google Search"><i></i></button></div>
          <div class="setting-toggle-row"><span>Grounding with Google Maps</span><button class="toggle" aria-label="Grounding with Google Maps"><i></i></button></div>
          <div class="settings-divider"></div>
          <div class="settings-footnote">Only the prompt, model, and thinking-level controls are connected in this build. Other tool controls are visual placeholders.</div>
        </div>
      </aside>
    </div>
    ${state.pickerOpen ? renderPicker() : ""}
    ${state.settingsOpen ? renderKeySettings() : ""}
    ${state.appError ? `<div class="toast-error" id="toast-error">${esc(state.appError)}<button id="dismiss-error">×</button></div>` : ""}
  </div>`;
  attachShellEvents();
}

function googleG(): string { return '<span class="google-g">G</span>'; }

function renderMessages(): string {
  return state.messages.map((message, index) => `<div class="message-row ${message.role}"><div class="message-avatar">${message.role === "user" ? "A" : "✦"}</div><div class="message-body"><div class="message-label">${message.role === "user" ? "You" : esc(message.model ?? currentModel()?.name ?? "Gemini")}</div><div class="message-text" data-message-index="${index}">${esc(message.text)}</div></div></div>`).join("");
}

function renderPicker(): string {
  const search = state.query.trim().toLowerCase();
  let visible = state.models.filter((m) => {
    const matchesSearch = !search || `${m.name} ${m.id} ${m.description}`.toLowerCase().includes(search);
    const matchesCategory = state.category === "All" || state.category === "Gemini" || (state.category === "Featured" && m.featured);
    return matchesSearch && matchesCategory;
  });
  if (state.category === "Live" || state.category === "Images" || state.category === "Video" || state.category === "Audio" || state.category === "Music" || state.category === "Agents" || state.category === "Gemma") visible = [];
  return `<div class="picker-backdrop" id="picker-backdrop"><section class="picker-panel" role="dialog" aria-modal="true" aria-label="Model selection">
    <div class="picker-header"><h2>Model selection</h2><button class="plain-icon" id="close-picker" aria-label="Close">${svg("close", 19)}</button></div>
    <div class="model-search">${svg("search", 17)}<input id="model-search" type="search" placeholder="Search for a model or agent" value="${esc(state.query)}" autocomplete="off"></div>
    <div class="category-tabs">${categories.map((category) => `<button class="category-tab ${state.category === category ? "selected" : ""}" data-category="${category}">${category}</button>`).join("")}</div>
    <div class="picker-meta"><div> <span class="meta-symbol">$</span> Free-tier eligible models <span class="meta-separator">•</span> Standard text pricing shown below</div><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Pricing details</a></div>
    <div class="picker-list" id="picker-list">
      ${state.modelLoadBusy ? `<div class="picker-empty"><span class="spinner"></span><p>Checking model access…</p></div>` : visible.length ? visible.map(renderModelCard).join("") : `<div class="picker-empty"><div class="empty-spark">✦</div><h3>${state.models.length ? "No models in this category" : "No eligible models found"}</h3><p>${state.models.length ? "This replica currently lists text-generation models only. Try the Gemini or Featured category." : "Check the API key and retry model discovery. The key must have access to at least one allowlisted free-tier model."}</p><button class="outline-button" id="retry-models">Refresh models</button></div>`}
    </div>
    <div class="picker-footer"><span>Only models documented as free-tier eligible are listed.</span><span>Free-tier quotas and availability are controlled by Google.</span></div>
  </section></div>`;
}

function renderModelCard(model: ModelInfo): string {
  const selected = model.id === state.selectedModelId;
  const favorite = state.favorites.has(model.id);
  const context = model.maxInputTokens ? `${number(model.maxInputTokens)} input · ${number(model.maxOutputTokens)} output tokens` : "Context details unavailable";
  return `<article class="model-card ${selected ? "selected-model" : ""}" data-model-card="${esc(model.id)}">
    <div class="model-icon"><span>✦</span></div>
    <div class="model-card-content">
      <div class="model-card-title-row"><div class="model-name-wrap"><span class="model-name">${esc(model.name)}</span>${model.featured ? '<span class="new-pill">Featured</span>' : ""}${selected ? '<span class="current-pill"><i></i> Current</span>' : ""}</div>
        <div class="model-card-actions"><button class="card-icon ${favorite ? "favorite" : ""}" data-favorite="${esc(model.id)}" title="Favorite">${svg("star", 17)}</button><button class="card-icon" data-copy="${esc(model.id)}" title="Copy model ID">${svg("copy", 17)}</button><button class="card-icon choose-model" data-select="${esc(model.id)}" title="Select model">${svg("plus", 17)}</button></div></div>
      <div class="model-id">${esc(model.id)}</div>
      <p class="model-description">${esc(model.description)}</p>
      <div class="model-meta-line"><span>${svg("info", 13)} ${context}</span><span>Free tier: <b>$0.00</b> input / output</span></div>
      <div class="model-meta-line paid-pricing"><span>Standard pricing: ${esc(model.inputPrice)} input / ${esc(model.outputPrice)} output per 1M tokens</span><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Learn more</a></div>
      <div class="model-meta-line"><span>Thinking: ${model.thinkingLevels.length ? model.thinkingLevels.map((x) => THINKING_LABELS[x] ?? x).join(", ") : "Not listed in current thinking controls"}</span></div>
    </div>
  </article>`;
}

function renderKeySettings(): string {
  return `<div class="settings-backdrop" id="settings-backdrop"><section class="key-settings-modal"><div class="modal-head"><div><h2>API key settings</h2><p>Replace the Gemini API key saved in Windows Credential Manager.</p></div><button class="plain-icon" id="close-key-settings">${svg("close", 18)}</button></div><form id="replace-key-form"><label for="replace-api-key">New Gemini API key</label><input id="replace-api-key" type="password" placeholder="Paste a replacement key" required minlength="10"><div id="replace-key-error" class="key-error"></div><div class="modal-actions"><button type="button" class="outline-button" id="remove-key">Remove saved key</button><button type="submit" class="primary-button" id="save-new-key">Validate and save</button></div></form><a class="external-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Manage API keys ↗</a></section></div>`;
}

function attachShellEvents(): void {
  document.querySelector<HTMLButtonElement>("#open-model-picker")?.addEventListener("click", openPicker);
  document.querySelector<HTMLButtonElement>("#close-picker")?.addEventListener("click", closePicker);
  document.querySelector<HTMLDivElement>("#picker-backdrop")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closePicker(); });
  document.querySelector<HTMLInputElement>("#model-search")?.addEventListener("input", (e) => {
    state.query = (e.target as HTMLInputElement).value;
    const list = document.querySelector<HTMLDivElement>("#picker-list");
    if (list) list.innerHTML = renderPickerListOnly();
    attachPickerListEvents();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category as ModelCategory;
    renderShell();
  }));
  attachPickerListEvents();
  document.querySelectorAll<HTMLButtonElement>(".example-prompt").forEach((button) => button.addEventListener("click", () => {
    const prompt = document.querySelector<HTMLTextAreaElement>("#prompt-input");
    if (prompt) { prompt.value = button.textContent ?? ""; prompt.focus(); growPrompt(prompt); }
  }));
  document.querySelector<HTMLButtonElement>("#run-button")?.addEventListener("click", submitPrompt);
  document.querySelector<HTMLButtonElement>("#stop-button")?.addEventListener("click", stopGeneration);
  document.querySelector<HTMLTextAreaElement>("#prompt-input")?.addEventListener("input", (e) => growPrompt(e.target as HTMLTextAreaElement));
  document.querySelector<HTMLTextAreaElement>("#prompt-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitPrompt(); }
  });
  document.querySelector<HTMLSelectElement>("#thinking-select")?.addEventListener("change", (e) => { state.thinking = (e.target as HTMLSelectElement).value; });
  ["#settings-key", "#settings-key-2", "#profile-key"].forEach((selector) => document.querySelector(selector)?.addEventListener("click", openKeySettings));
  document.querySelector<HTMLButtonElement>("#free-tier-info")?.addEventListener("click", () => showError("Free-tier eligibility is determined by Google's current pricing, account tier, quota and project billing configuration."));
  document.querySelector<HTMLButtonElement>("#dismiss-error")?.addEventListener("click", () => { state.appError = ""; renderShell(); });
  document.querySelector<HTMLButtonElement>("#close-key-settings")?.addEventListener("click", closeKeySettings);
  document.querySelector<HTMLDivElement>("#settings-backdrop")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeKeySettings(); });
  document.querySelector<HTMLFormElement>("#replace-key-form")?.addEventListener("submit", onReplaceKeySubmit);
  document.querySelector<HTMLButtonElement>("#remove-key")?.addEventListener("click", removeKey);
  document.querySelector<HTMLButtonElement>("#win-min")?.addEventListener("click", () => void getCurrentWindow().minimize());
  document.querySelector<HTMLButtonElement>("#win-max")?.addEventListener("click", () => void getCurrentWindow().toggleMaximize());
  document.querySelector<HTMLButtonElement>("#win-close")?.addEventListener("click", () => void getCurrentWindow().close());
}

function renderPickerListOnly(): string {
  const search = state.query.trim().toLowerCase();
  const list = state.models.filter((m) => (!search || `${m.name} ${m.id} ${m.description}`.toLowerCase().includes(search)) && (state.category === "All" || state.category === "Gemini" || (state.category === "Featured" && m.featured)));
  return list.length ? list.map(renderModelCard).join("") : `<div class="picker-empty"><div class="empty-spark">✦</div><h3>No matching models</h3><p>Try another search or select Gemini.</p></div>`;
}

function attachPickerListEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-model-card]").forEach((card) => card.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    const id = card.dataset.modelCard;
    if (id) chooseModel(id);
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-select]").forEach((button) => button.addEventListener("click", () => chooseModel(button.dataset.select!)));
  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.favorite!;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    renderShell();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy!); showError("Model ID copied."); }
    catch { showError("Clipboard access was unavailable."); }
  }));
  document.querySelector<HTMLButtonElement>("#retry-models")?.addEventListener("click", loadModels);
}

function openPicker(): void { state.pickerOpen = true; state.query = ""; state.category = "Featured"; renderShell(); document.querySelector<HTMLInputElement>("#model-search")?.focus(); }
function closePicker(): void { state.pickerOpen = false; renderShell(); }
function chooseModel(id: string): void {
  const model = state.models.find((item) => item.id === id);
  if (!model) return;
  state.selectedModelId = model.id;
  state.thinking = thinkingDefault(model);
  state.pickerOpen = false;
  renderShell();
}
function openKeySettings(): void { state.settingsOpen = true; renderShell(); }
function closeKeySettings(): void { state.settingsOpen = false; renderShell(); }
function growPrompt(el: HTMLTextAreaElement): void { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 170)}px`; }
function showError(message: string): void { state.appError = message; renderShell(); window.setTimeout(() => { if (state.appError === message) { state.appError = ""; renderShell(); } }, 5000); }

async function onKeySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const key = document.querySelector<HTMLInputElement>("#api-key")?.value.trim() ?? "";
  if (!key) return;
  state.keyBusy = true; state.keyError = ""; renderKeyScreen();
  try {
    await invoke("save_api_key", { apiKey: key });
    state.hasKey = true;
    await loadModels();
  } catch (error) {
    state.keyError = String(error);
    state.keyBusy = false;
    renderKeyScreen();
  }
}

async function onReplaceKeySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#replace-api-key");
  const error = document.querySelector<HTMLDivElement>("#replace-key-error");
  const button = document.querySelector<HTMLButtonElement>("#save-new-key");
  if (!input?.value.trim() || !button) return;
  button.disabled = true; button.textContent = "Validating…";
  try {
    await invoke("save_api_key", { apiKey: input.value.trim() });
    state.settingsOpen = false;
    state.models = [];
    state.selectedModelId = "";
    await loadModels();
  } catch (reason) {
    if (error) error.textContent = String(reason);
    button.disabled = false; button.textContent = "Validate and save";
  }
}

async function removeKey(): Promise<void> {
  try {
    await invoke("remove_api_key");
    state.hasKey = false; state.models = []; state.messages = []; state.settingsOpen = false; state.keyError = "";
    renderKeyScreen();
  } catch (error) { showError(String(error)); }
}

async function loadModels(): Promise<void> {
  state.modelLoadBusy = true;
  if (state.hasKey) renderShell();
  try {
    const models = await invoke<ModelInfo[]>("list_free_models");
    state.models = models;
    if (!models.some((m) => m.id === state.selectedModelId)) state.selectedModelId = models[0]?.id ?? "";
    state.thinking = thinkingDefault(currentModel());
    state.hasKey = true;
    state.modelLoadBusy = false;
    state.keyBusy = false;
    renderShell();
  } catch (error) {
    state.modelLoadBusy = false;
    state.keyBusy = false;
    state.appError = String(error);
    if (state.hasKey) renderShell(); else { state.keyError = String(error); renderKeyScreen(); }
  }
}

async function submitPrompt(): Promise<void> {
  if (state.busy) return;
  const input = document.querySelector<HTMLTextAreaElement>("#prompt-input");
  const prompt = input?.value.trim() ?? "";
  const model = currentModel();
  if (!prompt || !model) return;
  if (input) input.value = "";
  const requestId = crypto.randomUUID();
  state.messages.push({ role: "user", text: prompt }, { role: "assistant", text: "", model: model.name });
  state.busy = true; state.activeRequestId = requestId; state.appError = "";
  renderShell();
  const conversation = document.querySelector<HTMLDivElement>("#conversation-view");
  conversation?.scrollTo({ top: conversation.scrollHeight, behavior: "auto" });
  try {
    await invoke("start_generation", {
      requestId,
      prompt,
      modelId: model.id,
      thinkingLevel: state.thinking || null,
    });
  } catch (error) {
    state.busy = false; state.activeRequestId = "";
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "assistant" && !last.text) last.text = `Request could not start: ${String(error)}`;
    renderShell();
  }
}

async function stopGeneration(): Promise<void> {
  if (!state.activeRequestId) return;
  try { await invoke("stop_generation", { requestId: state.activeRequestId }); }
  catch (error) { showError(String(error)); }
}

let unlisteners: UnlistenFn[] = [];
async function registerEvents(): Promise<void> {
  unlisteners.forEach((fn) => fn()); unlisteners = [];
  unlisteners.push(await listen<{ requestId: string; text: string }>("generation://chunk", (event) => {
    if (event.payload.requestId !== state.activeRequestId) return;
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "assistant") {
      last.text += event.payload.text;
      const target = document.querySelector<HTMLElement>(`.message-text[data-message-index="${state.messages.length - 1}"]`);
      if (target) { target.textContent = last.text; const view = document.querySelector("#conversation-view"); if (view) view.scrollTop = view.scrollHeight; }
    }
  }));
  unlisteners.push(await listen<{ requestId: string; cancelled?: boolean }>("generation://done", (event) => {
    if (event.payload.requestId !== state.activeRequestId) return;
    state.busy = false; state.activeRequestId = ""; renderShell();
  }));
  unlisteners.push(await listen<{ requestId: string; message: string }>("generation://error", (event) => {
    if (event.payload.requestId !== state.activeRequestId) return;
    state.busy = false; state.activeRequestId = "";
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "assistant" && !last.text) last.text = `Generation failed: ${event.payload.message}`;
    else state.appError = event.payload.message;
    renderShell();
  }));
}

async function bootstrap(): Promise<void> {
  try {
    await registerEvents();
    const hasKey = await invoke<boolean>("has_api_key");
    state.hasKey = hasKey;
    if (hasKey) await loadModels(); else renderKeyScreen();
  } catch (error) {
    // Running in an ordinary browser is useful for inspecting the UI, but API access needs Tauri.
    state.hasKey = false;
    state.keyError = `Launch the Windows desktop build to connect securely. ${String(error)}`;
    renderKeyScreen();
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (state.pickerOpen) closePicker();
    if (state.settingsOpen) closeKeySettings();
  }
});

void bootstrap();
