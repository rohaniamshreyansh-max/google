# Studio Desk

A lightweight Windows desktop client inspired by the Google AI Studio Playground screenshots supplied for this project. It uses Tauri 2, a vanilla TypeScript/CSS frontend, Rust for API access, and Windows Credential Manager for the Gemini API key.

> **Build status:** this repository contains the application source and a Windows GitHub Actions build workflow. It has not been compiled or run as a Windows desktop application in this environment because the Rust toolchain and Windows WebView2 runtime are unavailable here. Do not treat the installers as tested until the workflow succeeds and you test the resulting installer on Windows 10.

## Reference screenshots

The two source screenshots used for the design are included in `docs/reference-playground.png` and `docs/reference-model-selection.png`.

## Included features

- Three-column Playground layout with navigation, workspace/composer, and Run Settings panel.
- Right-docked model selector with search, category tabs, model cards, selection state, favorites, copy-ID actions, dark overlay, and background blur.
- First-launch Gemini API key setup and key replacement/removal.
- API key stored through Windows Credential Manager (not localStorage or frontend source). Windows Credential Manager uses Windows-protected credential storage.
- Live API model discovery, intersected with a strict source-reviewed allowlist of free-tier-eligible text models.
- Real Gemini Interactions API streaming with `thinking_level` where the selected model's current official docs list supported levels, plus immediate stream cancellation from Stop.
- Ctrl+Enter to run and a Stop control.
- GitHub Actions workflow that builds both an NSIS `.exe` installer and an MSI installer for Windows x64.

The sidebar links, example preview cards, system-instructions field, and tool toggles are visual-only. Search, category filtering, favorite/copy, actual prompt submission, model selection, and thinking level are implemented.

## Verified model policy

The runtime model list is the intersection of:

1. The hardcoded allowlist below, which is based on the official Gemini API pricing page's Free Tier column; and
2. The model IDs returned by `models.list` for the API key currently stored in Windows Credential Manager.

| Model ID | Free-tier status in official pricing | Standard input / output (USD per 1M tokens) | Thinking levels shown |
|---|---|---:|---|
| `gemini-3.8-flash` | Free of charge | $0.75 / $3.75 | Low, Medium, High |
| `gemini-3.6-flash` | Free of charge | $0.75 / $3.75 | Minimal, Low, Medium, High |
| `gemini-3.5-flash-lite` | Free of charge | $0.30 / $2.50 | Minimal, Low, Medium, High |
| `gemini-3.1-flash-lite` | Free of charge | $0.25 / $1.50 | No thinking-level selector exposed |

These are the models documented on **2026-10-31**. Google can change models, prices, and access. The app's allowlist is intentionally conservative and must be reviewed against the official pricing page before future releases.

### Important free-tier and billing limitation

"Free-tier eligible" does not guarantee that a particular Google Cloud/AI Studio project is currently on the free tier, has quota remaining, or is not configured for paid billing. The app only selects model IDs whose official pricing page currently lists free-tier token pricing. It does not inspect or control the project's billing configuration and cannot guarantee that Google will never charge a paid-tier project. Check the project's billing/tier status in Google AI Studio before use. Grounding, paid-only tools, and other billable tools are not invoked by this build.

## Requirements for Windows 10

- Windows 10 x64.
- Microsoft Edge WebView2 Runtime. The installer is configured to download the WebView2 bootstrapper if the runtime is missing. On machines without internet access during setup, install the Evergreen WebView2 Runtime separately first.
- A Gemini API key from Google AI Studio.
- Internet connection for API requests.

The interface is aimed at a 1366 × 768 display and is designed to remain usable on a dual-core Pentium-class computer. Actual CPU/RAM performance must be measured on the target PC; no benchmark is claimed here.

## Get an API key

Use Google's official AI Studio API key page: https://aistudio.google.com/app/apikey

The app validates the key by requesting the official model-list endpoint before saving it. The key is written to a Windows generic credential named `StudioDesk.GeminiAPIKey`. It is not stored in frontend localStorage, a `.env` file, or the app's source tree.

## Build locally on Windows

Install:

1. Node.js 22 LTS.
2. Rust stable with the MSVC target.
3. Microsoft C++ Build Tools (Desktop development with C++).
4. WebView2 Runtime (the installer can bootstrap it for end users).

Then, from the project directory in PowerShell:

```powershell
npm ci
npm run tauri -- dev
```

To build both installer formats:

```powershell
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis,msi
```

The output is expected under:

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/
```

MSI builds require the Windows WiX toolset support used by Tauri. If only the NSIS `.exe` is needed, use `--bundles nsis`.

## Build with GitHub Actions (recommended for this PC)

1. Create an empty GitHub repository.
2. Upload or push this entire project folder to that repository.
3. Open the repository's **Actions** tab.
4. Select **Build Windows installers**.
5. Click **Run workflow**.
6. When it finishes successfully, open the run and download the `studio-desk-windows-x64` artifact.

The artifact contains the NSIS `.exe` setup and MSI installer. This workflow does not require a GitHub token secret because it uploads a workflow artifact rather than publishing a GitHub Release. It runs on GitHub's Windows runner, not on your Pentium PC.

## Technical notes

- Frontend: vanilla TypeScript + CSS, bundled by Vite.
- Desktop: Tauri 2.
- Networking: Rust `reqwest` with Rustls TLS.
- Streaming endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions` with SSE and `stream: true`.
- Model discovery: `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000`.
- Secure key storage: Windows Credential Manager API (`CredWriteW`, `CredReadW`, `CredDeleteW`).
- Generation is restricted in the Rust backend to the same free-tier allowlist; changing frontend state cannot send a paid-only model ID.
- Only text output deltas are forwarded to the UI. Thought summaries are intentionally not exposed.

## Known limitations in this first build

- The interface follows the supplied screenshots but is not a pixel-perfect clone; the screenshot's browser toolbar is intentionally replaced with a native-like app title bar.
- The current app is a single-session Playground; it does not persist chat history.
- The tool switches, attachments, microphone, system instructions, history, Gallery, Dashboard, and code export are visual-only.
- Category tabs for Live, Images, Video, Audio, Music, Agents, and Gemma currently show an empty state because this version intentionally lists text-generation models only.
- The free-tier model set is a versioned allowlist. Google's API does not return a per-key "free tier" boolean; therefore the app cannot dynamically infer billing status from `models.list`.
- The current streaming integration uses the official Interactions API. A model may be returned by `models.list` yet still be restricted for a particular project or endpoint; such API errors are shown rather than triggering a paid model fallback.
- No Windows build, live Gemini request, or performance benchmark is represented as tested until you run the Windows workflow/app.

## Official references

- Models: https://ai.google.dev/gemini-api/docs/models
- Models API (`models.list`): https://ai.google.dev/api/models
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini thinking levels and streaming Interactions API: https://ai.google.dev/gemini-api/docs/thinking
- Tauri 2 configuration: https://v2.tauri.app/reference/config/
- Tauri Windows installers: https://v2.tauri.app/distribute/windows-installer/
