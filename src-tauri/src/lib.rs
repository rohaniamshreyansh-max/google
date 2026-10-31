use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
use tauri::{AppHandle, Emitter, State};

const GOOGLE_MODELS_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const GOOGLE_INTERACTIONS_URL: &str = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CREDENTIAL_TARGET: &str = "StudioDesk.GeminiAPIKey";

#[derive(Clone)]
struct AppState {
    client: Client,
    cancellations: Arc<Mutex<HashMap<String, Arc<CancelSignal>>>>,
}

struct CancelSignal {
    flag: AtomicBool,
    notify: Notify,
}

#[derive(Clone)]
struct ModelPolicy {
    id: &'static str,
    display_name: &'static str,
    description: &'static str,
    input_price: &'static str,
    output_price: &'static str,
    thinking_levels: &'static [&'static str],
    featured: bool,
}

fn free_model_policy() -> Vec<ModelPolicy> {
    // Eligibility is curated from Google's official pricing page (checked 2026-10-31).
    // Runtime discovery intersects this allowlist with models actually returned for this key.
    vec![
        ModelPolicy {
            id: "gemini-3.8-flash",
            display_name: "Gemini 3.8 Flash",
            description: "Google's latest Flash model for coding, reasoning, autonomous agents, and everyday multimodal tasks.",
            input_price: "$0.75",
            output_price: "$3.75",
            thinking_levels: &["low", "medium", "high"],
            featured: true,
        },
        ModelPolicy {
            id: "gemini-3.6-flash",
            display_name: "Gemini 3.6 Flash",
            description: "Previous-generation Flash model balancing speed and multimodal capabilities for general tasks.",
            input_price: "$0.75",
            output_price: "$3.75",
            thinking_levels: &["minimal", "low", "medium", "high"],
            featured: true,
        },
        ModelPolicy {
            id: "gemini-3.5-flash-lite",
            display_name: "Gemini 3.5 Flash-Lite",
            description: "Cost-efficient model optimized for high-throughput tasks, translation, and lightweight agent workflows.",
            input_price: "$0.30",
            output_price: "$2.50",
            thinking_levels: &["minimal", "low", "medium", "high"],
            featured: false,
        },
        ModelPolicy {
            id: "gemini-3.1-flash-lite",
            display_name: "Gemini 3.1 Flash-Lite",
            description: "Efficient model designed for high-volume tasks, translation, and low-cost text generation.",
            input_price: "$0.25",
            output_price: "$1.50",
            thinking_levels: &[],
            featured: false,
        },
    ]
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleModelList {
    models: Option<Vec<GoogleModel>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleModel {
    name: String,
    display_name: Option<String>,
    description: Option<String>,
    input_token_limit: Option<u64>,
    output_token_limit: Option<u64>,
    supported_generation_methods: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelInfo {
    id: String,
    name: String,
    description: String,
    max_input_tokens: Option<u64>,
    max_output_tokens: Option<u64>,
    input_price: String,
    output_price: String,
    free_tier: bool,
    thinking_levels: Vec<String>,
    category: String,
    featured: bool,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("StudioDesk/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Could not create the network client: {e}"))
}

#[tauri::command]
fn has_api_key() -> bool {
    read_credential().is_ok()
}

#[tauri::command]
async fn save_api_key(api_key: String, state: State<'_, AppState>) -> Result<(), String> {
    let key = api_key.trim();
    if key.len() < 10 || key.len() > 512 {
        return Err("That does not look like a valid Gemini API key.".into());
    }

    let response = state.client
        .get(GOOGLE_MODELS_URL)
        .header("x-goog-api-key", key)
        .send().await
        .map_err(|e| format!("Could not reach Google's Gemini API: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let details = response.text().await.unwrap_or_default();
        return Err(format_google_error(status, &details));
    }

    let _parsed: GoogleModelList = response.json().await
        .map_err(|_| "Google accepted the request, but its model-list response could not be read.".to_string())?;
    write_credential(key).map_err(|e| format!("The API key was validated, but Windows could not save it securely: {e}"))?;
    Ok(())
}

#[tauri::command]
fn remove_api_key() -> Result<(), String> {
    delete_credential().map_err(|e| format!("Could not remove the saved API key: {e}"))
}

#[tauri::command]
async fn list_free_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let api_key = read_credential().map_err(|_| "No saved Gemini API key. Add a key in the setup screen.".to_string())?;
    let response = state.client.get(GOOGLE_MODELS_URL)
        .header("x-goog-api-key", &api_key)
        .send().await.map_err(|e| format!("Could not refresh Gemini models: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let details = response.text().await.unwrap_or_default();
        return Err(format_google_error(status, &details));
    }
    let result: GoogleModelList = response.json().await
        .map_err(|e| format!("Could not parse Google's model list: {e}"))?;
    let available = result.models.unwrap_or_default();
    let mut output = Vec::new();

    for policy in free_model_policy() {
        let live = available.iter().find(|model| {
            model.name.rsplit('/').next().unwrap_or(&model.name) == policy.id
        });
        let Some(live) = live else { continue; };

        // The current app uses Google's Interactions API. The standard model catalogue
        // does not expose a dedicated Interactions capability flag, so runtime presence
        // is checked here and unsupported requests are reported by the API without fallback.
        let _advertised_methods = live.supported_generation_methods.as_deref().unwrap_or(&[]);
        output.push(ModelInfo {
            id: policy.id.to_string(),
            name: live.display_name.clone().unwrap_or_else(|| policy.display_name.to_string()),
            description: if live.description.as_deref().unwrap_or("").trim().is_empty() {
                policy.description.to_string()
            } else {
                // Keep the card copy concise and consistent with the reference UI.
                policy.description.to_string()
            },
            max_input_tokens: live.input_token_limit,
            max_output_tokens: live.output_token_limit,
            input_price: policy.input_price.to_string(),
            output_price: policy.output_price.to_string(),
            free_tier: true,
            thinking_levels: policy.thinking_levels.iter().map(|s| s.to_string()).collect(),
            category: "Gemini".to_string(),
            featured: policy.featured,
        });
    }

    if output.is_empty() {
        return Err("This key did not return any of the currently verified free-tier text-generation models. Check the API key's project access and try again.".into());
    }
    Ok(output)
}

#[derive(Debug, Deserialize)]
struct InteractionEvent {
    event_type: Option<String>,
    delta: Option<Value>,
    error: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChunkEvent {
    request_id: String,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    request_id: String,
    cancelled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    request_id: String,
    message: String,
}

#[tauri::command]
fn start_generation(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    prompt: String,
    model_id: String,
    thinking_level: Option<String>,
) -> Result<(), String> {
    if request_id.len() > 100 || request_id.trim().is_empty() {
        return Err("Invalid generation request identifier.".into());
    }
    if prompt.trim().is_empty() || prompt.len() > 1_000_000 {
        return Err("Enter a prompt (maximum 1 MB).".into());
    }

    let policy = free_model_policy().into_iter().find(|m| m.id == model_id)
        .ok_or_else(|| "That model is not in the verified free-tier allowlist.".to_string())?;
    let thinking = match thinking_level {
        Some(level) if policy.thinking_levels.contains(&level.as_str()) => Some(level),
        Some(_) => return Err("The selected thinking level is not supported by this model.".into()),
        None if policy.thinking_levels.is_empty() => None,
        None => Some("medium".to_string()),
    };

    let api_key = read_credential().map_err(|_| "No saved Gemini API key. Add one in settings.".to_string())?;
    let cancel = Arc::new(CancelSignal { flag: AtomicBool::new(false), notify: Notify::new() });
    {
        let mut active = state.cancellations.lock().map_err(|_| "Generation state is unavailable.".to_string())?;
        if active.len() >= 1 {
            return Err("A generation is already running.".into());
        }
        active.insert(request_id.clone(), cancel.clone());
    }

    let client = state.client.clone();
    let cancellations = state.cancellations.clone();
    let id = request_id.clone();
    tauri::async_runtime::spawn(async move {
        let result = stream_interaction(
            app.clone(), client, api_key, id.clone(), prompt, model_id, thinking, cancel.clone()
        ).await;

        match result {
            Ok(cancelled) => { let _ = app.emit("generation://done", DoneEvent { request_id: id.clone(), cancelled }); }
            Err(message) => { let _ = app.emit("generation://error", ErrorEvent { request_id: id.clone(), message }); }
        }
        if let Ok(mut active) = cancellations.lock() { active.remove(&id); }
    });
    Ok(())
}

#[tauri::command]
fn stop_generation(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let active = state.cancellations.lock().map_err(|_| "Generation state is unavailable.".to_string())?;
    if let Some(signal) = active.get(&request_id) {
        signal.flag.store(true, Ordering::Relaxed);
        signal.notify.notify_one();
    }
    Ok(())
}

async fn stream_interaction(
    app: AppHandle,
    client: Client,
    api_key: String,
    request_id: String,
    prompt: String,
    model_id: String,
    thinking_level: Option<String>,
    cancel: Arc<CancelSignal>,
) -> Result<bool, String> {
    let mut body = json!({
        "model": model_id,
        "input": prompt,
        "stream": true
    });
    if let Some(level) = thinking_level {
        body["generation_config"] = json!({ "thinking_level": level });
    }

    let response = client.post(GOOGLE_INTERACTIONS_URL)
        .header("x-goog-api-key", api_key)
        .header(header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send().await.map_err(|e| format!("Gemini request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let details = response.text().await.unwrap_or_default();
        return Err(format_google_error(status, &details));
    }

    let mut stream = response.bytes_stream();
    let mut pending = String::new();
    loop {
        if cancel.flag.load(Ordering::Relaxed) { return Ok(true); }
        let next = tokio::select! {
            chunk = stream.next() => chunk,
            _ = cancel.notify.notified() => return Ok(true),
        };
        let Some(next) = next else { break; };
        let chunk = next.map_err(|e| format!("The response stream was interrupted: {e}"))?;
        pending.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline) = pending.find('\n') {
            let line = pending.drain(..=newline).collect::<String>();
            let line = line.trim_end_matches(|c| c == '\r' || c == '\n').trim();
            if !line.starts_with("data:") { continue; }
            let data = line[5..].trim();
            if data.is_empty() || data == "[DONE]" { continue; }

            let Ok(event) = serde_json::from_str::<InteractionEvent>(data) else { continue; };
            if event.event_type.as_deref() == Some("interaction.failed") {
                let message = event.error.and_then(|e| e.get("message").and_then(Value::as_str).map(str::to_string))
                    .unwrap_or_else(|| "Gemini reported that the interaction failed.".to_string());
                return Err(message);
            }

            if event.event_type.as_deref() == Some("step.delta") {
                if let Some(delta) = event.delta {
                    // Only forward final text deltas. Thought summaries are a distinct
                    // delta type and are intentionally not displayed or logged.
                    if delta.get("type").and_then(Value::as_str) == Some("text") {
                        let text = delta.get("text").and_then(Value::as_str)
                            .or_else(|| delta.get("content").and_then(|v| v.get("text")).and_then(Value::as_str));
                        if let Some(text) = text.filter(|s| !s.is_empty()) {
                            let _ = app.emit("generation://chunk", ChunkEvent { request_id: request_id.clone(), text: text.to_string() });
                        }
                    }
                }
            }
        }
    }
    Ok(cancel.flag.load(Ordering::Relaxed))
}

fn format_google_error(status: StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body).ok()
        .and_then(|v| v.get("error").and_then(|e| e.get("message")).and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| body.chars().take(280).collect::<String>());
    match status.as_u16() {
        400 => format!("Google rejected the request: {detail}"),
        401 | 403 => format!("The API key is invalid or does not have access: {detail}"),
        404 => format!("The selected model or API endpoint is unavailable: {detail}"),
        429 => format!("Gemini rate limit or free-tier quota reached: {detail}"),
        _ => format!("Gemini API returned HTTP {}: {detail}", status.as_u16()),
    }
}

#[cfg(windows)]
mod windows_credentials {
    use std::ffi::c_void;
    use std::io;
    use std::ptr;

    const CRED_TYPE_GENERIC: u32 = 1;
    const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;

    #[repr(C)]
    struct FileTime { low: u32, high: u32 }

    #[repr(C)]
    struct CredentialW {
        flags: u32,
        kind: u32,
        target_name: *mut u16,
        comment: *mut u16,
        last_written: FileTime,
        credential_blob_size: u32,
        credential_blob: *mut u8,
        persist: u32,
        attribute_count: u32,
        attributes: *mut c_void,
        target_alias: *mut u16,
        user_name: *mut u16,
    }

    #[link(name = "Advapi32")]
    extern "system" {
        fn CredWriteW(credential: *const CredentialW, flags: u32) -> i32;
        fn CredReadW(target: *const u16, kind: u32, flags: u32, credential: *mut *mut CredentialW) -> i32;
        fn CredDeleteW(target: *const u16, kind: u32, flags: u32) -> i32;
        fn CredFree(buffer: *mut c_void);
    }

    fn target() -> Vec<u16> { format!("{}\0", super::CREDENTIAL_TARGET).encode_utf16().collect() }

    pub fn write(secret: &str) -> io::Result<()> {
        let mut target_name = target();
        let mut username: Vec<u16> = "Gemini API Key\0".encode_utf16().collect();
        let mut blob = secret.as_bytes().to_vec();
        let credential = CredentialW {
            flags: 0,
            kind: CRED_TYPE_GENERIC,
            target_name: target_name.as_mut_ptr(),
            comment: ptr::null_mut(),
            last_written: FileTime { low: 0, high: 0 },
            credential_blob_size: blob.len() as u32,
            credential_blob: blob.as_mut_ptr(),
            persist: CRED_PERSIST_LOCAL_MACHINE,
            attribute_count: 0,
            attributes: ptr::null_mut(),
            target_alias: ptr::null_mut(),
            user_name: username.as_mut_ptr(),
        };
        let result = unsafe { CredWriteW(&credential, 0) };
        if result == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
    }

    pub fn read() -> io::Result<String> {
        let target_name = target();
        let mut credential: *mut CredentialW = ptr::null_mut();
        let result = unsafe { CredReadW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
        if result == 0 { return Err(io::Error::last_os_error()); }
        if credential.is_null() { return Err(io::Error::new(io::ErrorKind::NotFound, "Credential not found")); }
        let value = unsafe {
            let item = &*credential;
            let bytes = std::slice::from_raw_parts(item.credential_blob, item.credential_blob_size as usize);
            String::from_utf8(bytes.to_vec()).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Stored credential is not valid UTF-8"))
        };
        unsafe { CredFree(credential.cast()); }
        value
    }

    pub fn delete() -> io::Result<()> {
        let target_name = target();
        let result = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if result == 0 {
            let error = io::Error::last_os_error();
            // ERROR_NOT_FOUND (1168) is equivalent to an already-removed key.
            if error.raw_os_error() == Some(1168) { Ok(()) } else { Err(error) }
        } else { Ok(()) }
    }
}

#[cfg(not(windows))]
mod windows_credentials {
    use std::io;
    pub fn write(_secret: &str) -> io::Result<()> { Err(io::Error::new(io::ErrorKind::Unsupported, "Secure API-key storage is implemented for Windows builds.")) }
    pub fn read() -> io::Result<String> { Err(io::Error::new(io::ErrorKind::NotFound, "No Windows credential is available.")) }
    pub fn delete() -> io::Result<()> { Ok(()) }
}

fn write_credential(secret: &str) -> Result<(), String> {
    windows_credentials::write(secret).map_err(|e| e.to_string())
}
fn read_credential() -> Result<String, String> {
    windows_credentials::read().map_err(|e| e.to_string())
}
fn delete_credential() -> Result<(), String> {
    windows_credentials::delete().map_err(|e| e.to_string())
}

pub fn run() {
    let state = AppState {
        client: http_client().expect("Failed to initialize HTTP client"),
        cancellations: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            has_api_key,
            save_api_key,
            remove_api_key,
            list_free_models,
            start_generation,
            stop_generation
        ])
        .run(tauri::generate_context!())
        .expect("error while running Studio Desk");
}
