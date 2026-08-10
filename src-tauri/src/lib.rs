use std::{
  env,
  fs::{self, create_dir_all, OpenOptions},
  io::Write,
  os::unix::fs::{symlink, PermissionsExt},
  os::unix::process::CommandExt,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
};

use tauri::{path::BaseDirectory, Manager, WindowEvent};

struct CoreProcess(Mutex<Option<Child>>);

impl CoreProcess {
  fn terminate(&self) {
    if let Ok(mut guard) = self.0.lock() {
      if let Some(mut child) = guard.take() {
        let pid = child.id();
        let _ = Command::new("/bin/kill")
          .arg("-TERM")
          .arg(format!("-{pid}"))
          .status();
        for _ in 0..10 {
          if matches!(child.try_wait(), Ok(Some(_))) {
            return;
          }
          std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  }
}

impl Drop for CoreProcess {
  fn drop(&mut self) {
    self.terminate();
  }
}

fn is_core_dir(path: &Path) -> bool {
  path.join("package.json").is_file()
    && path.join("src").join("index.ts").is_file()
    && path.join("node_modules").join("tsx").join("dist").join("cli.mjs").is_file()
}

fn core_launch_path() -> String {
  let mut entries = Vec::new();
  entries.push("/opt/homebrew/opt/node@22/bin".to_string());
  if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
    entries.push(home.join(".local").join("bin").to_string_lossy().to_string());
    entries.push(home.join(".bun").join("bin").to_string_lossy().to_string());
    entries.push(home.join(".npm-global").join("bin").to_string_lossy().to_string());
    entries.push(home.join(".nvm").join("current").join("bin").to_string_lossy().to_string());
  }
  if let Ok(nvm_bin) = env::var("NVM_BIN") {
    entries.push(nvm_bin);
  }
  entries.push("/opt/homebrew/bin".to_string());
  entries.push("/usr/local/bin".to_string());
  entries.push("/usr/bin".to_string());
  entries.push("/bin".to_string());
  if let Ok(existing) = env::var("PATH") {
    entries.push(existing);
  }
  entries.join(":")
}

fn is_executable_file(path: &Path) -> bool {
  fs::metadata(path)
    .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
    .unwrap_or(false)
}

fn first_executable_node(candidates: &[PathBuf]) -> Option<PathBuf> {
  candidates.iter().find(|path| is_executable_file(path)).cloned()
}

fn resolve_core_node(core_dir: &Path) -> Option<PathBuf> {
  let mut candidates = vec![core_dir.join("node").join("bin").join("node")];
  if let Ok(explicit) = env::var("DEVDIARY_NODE_BIN") {
    let explicit = PathBuf::from(explicit.trim());
    if !explicit.as_os_str().is_empty() {
      candidates.push(explicit);
    }
  }
  candidates.push(PathBuf::from("/opt/homebrew/opt/node@22/bin/node"));
  candidates.extend(
    core_launch_path()
      .split(':')
      .filter(|entry| !entry.is_empty())
      .map(|entry| PathBuf::from(entry).join("node")),
  );
  first_executable_node(&candidates)
}

fn app_data_dir() -> Option<PathBuf> {
  env::var_os("HOME")
    .map(PathBuf::from)
    .map(|home| home.join("Library").join("Application Support").join("DevDiary"))
}

fn default_core_manifest_path() -> Option<PathBuf> {
  app_data_dir().map(|dir| dir.join("core-runtime.json"))
}

fn resolve_core_manifest_path() -> Option<PathBuf> {
  if let Ok(explicit) = env::var("DEVDIARY_CORE_MANIFEST") {
    let trimmed = explicit.trim();
    if !trimmed.is_empty() {
      return Some(PathBuf::from(trimmed));
    }
  }
  default_core_manifest_path()
}

fn is_pid_alive(pid: i64) -> bool {
  if pid <= 0 {
    return false;
  }
  Command::new("/bin/kill")
    .arg("-0")
    .arg(pid.to_string())
    .status()
    .map(|status| status.success())
    .unwrap_or(false)
}

// Mirrors src/api/devCoreTarget.js's resolveCoreApiTarget: only trust a manifest
// that names the Core service, points at loopback, and whose owner pid is alive.
// A manifest left behind by a crashed/killed Core (no cleanup ran) must not be
// trusted, or the packaged app would keep dialing a dead port forever.
fn resolve_core_api_origin_from_manifest(manifest_path: &Path, is_alive: impl Fn(i64) -> bool) -> Option<String> {
  let contents = fs::read_to_string(manifest_path).ok()?;
  let manifest: serde_json::Value = serde_json::from_str(&contents).ok()?;
  if manifest.get("service").and_then(|value| value.as_str()) != Some("devdiary-core") {
    return None;
  }
  let runtime = manifest.get("runtime")?;
  let host = runtime.get("host").and_then(|value| value.as_str())?;
  if host != "127.0.0.1" && host != "localhost" {
    return None;
  }
  let port = runtime.get("port").and_then(json_mathematically_integral_i64)?;
  if !(1..=65_535).contains(&port) {
    return None;
  }
  let pid = runtime.get("pid").and_then(json_mathematically_integral_i64)?;
  if pid <= 0 || !is_alive(pid) {
    return None;
  }
  let origin = format!("http://{host}:{port}");
  if let Some(url) = manifest.get("url") {
    if url.as_str() != Some(origin.as_str()) {
      return None;
    }
  }
  Some(origin)
}

fn json_mathematically_integral_i64(value: &serde_json::Value) -> Option<i64> {
  if let Some(integer) = value.as_i64() {
    return Some(integer);
  }
  let number = value.as_f64()?;
  if !number.is_finite()
    || number.fract() != 0.0
    || number < i64::MIN as f64
    || number > i64::MAX as f64
  {
    return None;
  }
  Some(number as i64)
}

fn fallback_core_api_origin_from_port(value: Option<&str>) -> String {
  let port = value
    .map(str::trim)
    .filter(|raw| !raw.is_empty() && raw.bytes().all(|byte| byte.is_ascii_digit()))
    .and_then(|raw| raw.parse::<u16>().ok())
    .filter(|port| *port > 0)
    .unwrap_or(4317);
  format!("http://127.0.0.1:{port}")
}

fn fallback_core_api_origin() -> String {
  let configured = env::var("DEVDIARY_PORT").ok();
  fallback_core_api_origin_from_port(configured.as_deref())
}

#[tauri::command]
fn resolve_core_api_origin() -> String {
  resolve_core_manifest_path()
    .and_then(|path| resolve_core_api_origin_from_manifest(&path, is_pid_alive))
    .unwrap_or_else(fallback_core_api_origin)
}

fn launch_agent_storage_dir(app_dir: &Path) -> PathBuf {
  app_dir.join("LaunchAgents")
}

fn resolve_launch_agent_storage_dir(app_dir: &Path, _core_dir: &Path) -> PathBuf {
  launch_agent_storage_dir(app_dir)
}

fn open_core_log() -> Option<std::fs::File> {
  let dir = app_data_dir()?;
  create_dir_all(&dir).ok()?;
  OpenOptions::new()
    .create(true)
    .append(true)
    .open(dir.join("core-tauri.log"))
    .ok()
}

fn append_core_log(message: &str) {
  if let Some(mut log_file) = open_core_log() {
    let _ = writeln!(log_file, "{message}");
  }
}

fn resolve_core_dir<R: tauri::Runtime>(app: &tauri::App<R>) -> Option<PathBuf> {
  if let Ok(explicit) = env::var("DEVDIARY_CORE_DIR") {
    let path = PathBuf::from(explicit.trim());
    if is_core_dir(&path) {
      return Some(path);
    }
  }

  if let Ok(package_json) = app.path().resolve("core/package.json", BaseDirectory::Resource) {
    if let Some(resource_core) = package_json.parent() {
      if is_core_dir(resource_core) {
        return Some(resource_core.to_path_buf());
      }
    }
  }

  if let Ok(current_dir) = env::current_dir() {
    for candidate in [current_dir.join("core"), current_dir.join("..").join("core")] {
      if is_core_dir(&candidate) {
        return Some(candidate);
      }
    }
  }

  None
}

fn shell_quote(value: &Path) -> String {
  format!("'{}'", value.to_string_lossy().replace('\'', "'\\''"))
}

fn current_uid() -> Option<String> {
  let output = Command::new("/usr/bin/id").arg("-u").output().ok()?;
  if !output.status.success() {
    return None;
  }
  let uid = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if uid.is_empty() { None } else { Some(uid) }
}

fn write_executable_file(path: &Path, content: &str) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    create_dir_all(parent).map_err(|err| format!("create launcher dir failed: {err}"))?;
  }
  fs::write(path, content).map_err(|err| format!("write launcher failed: {err}"))?;
  let mut permissions = fs::metadata(path)
    .map_err(|err| format!("read launcher metadata failed: {err}"))?
    .permissions();
  permissions.set_mode(0o755);
  fs::set_permissions(path, permissions).map_err(|err| format!("chmod launcher failed: {err}"))?;
  Ok(())
}

fn write_private_file(path: &Path, content: &str) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    create_dir_all(parent).map_err(|err| format!("create plist dir failed: {err}"))?;
  }
  fs::write(path, content).map_err(|err| format!("write plist failed: {err}"))?;
  let mut permissions = fs::metadata(path)
    .map_err(|err| format!("read plist metadata failed: {err}"))?
    .permissions();
  permissions.set_mode(0o600);
  fs::set_permissions(path, permissions).map_err(|err| format!("chmod plist failed: {err}"))?;
  Ok(())
}

fn prepare_validated_launch_agent_source(
  source_path: &Path,
  content: &str,
  validate: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
  let file_name = source_path
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "LaunchAgent source path has no valid filename".to_string())?;
  let candidate_path = source_path.with_file_name(format!("{file_name}.candidate"));
  let result = (|| {
    write_private_file(&candidate_path, content)?;
    validate(&candidate_path)?;
    fs::rename(&candidate_path, source_path)
      .map_err(|err| format!("promote validated LaunchAgent plist failed: {err}"))?;
    Ok(())
  })();
  if result.is_err() {
    let _ = fs::remove_file(&candidate_path);
  }
  result
}

fn background_launcher_script(core_dir: &Path, app_dir: &Path) -> String {
  format!(
    r#"#!/usr/bin/env bash
set -euo pipefail

CORE_DIR={}
APP_DATA_DIR={}
MODE="${{1:-run}}"
if [[ $# -gt 0 ]]; then
  shift
fi
LOG_DIR="$APP_DATA_DIR/logs"

if [[ "$MODE" != "run" && "$MODE" != "once" ]]; then
  echo "Usage: $0 [run|once]" >&2
  exit 64
fi

mkdir -p "$LOG_DIR"

export PATH="${{HOME}}/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${{PATH:-}}"
export DEVDIARY_APP_RUNTIME="${{DEVDIARY_APP_RUNTIME:-launchagent}}"
export DEVDIARY_BACKGROUND_START_DELAY_MS="${{DEVDIARY_BACKGROUND_START_DELAY_MS:-45000}}"

NODE_BIN="${{DEVDIARY_NODE_BIN:-}}"
if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/opt/node@22/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js executable was not found. Install node@22 with Homebrew or set DEVDIARY_NODE_BIN." >&2
  exit 69
fi

cd "$CORE_DIR"
exec "$NODE_BIN" ./node_modules/tsx/dist/cli.mjs src/backgroundRunner.ts "$MODE" "$@"
"#,
    shell_quote(core_dir),
    shell_quote(app_dir)
  )
}

fn background_launch_agent_plist(label: &str, launcher: &Path, root_dir: &Path, log_dir: &Path) -> String {
  format!(
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>{launcher}</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>WorkingDirectory</key>
  <string>{root_dir}</string>
  <key>StandardOutPath</key>
  <string>{stdout}</string>
  <key>StandardErrorPath</key>
  <string>{stderr}</string>
</dict>
</plist>
"#,
    label = label,
    launcher = launcher.display(),
    root_dir = root_dir.display(),
    stdout = log_dir.join("background-runner.out.log").display(),
    stderr = log_dir.join("background-runner.err.log").display(),
  )
}

fn plist_string_value(contents: &str, key: &str) -> Option<String> {
  let marker = format!("<key>{key}</key>");
  let after_key = contents.split_once(&marker)?.1;
  let after_open = after_key.split_once("<string>")?.1;
  Some(after_open.split_once("</string>")?.0.trim().to_string())
}

fn legacy_devdiary_background_label(contents: &str, current_label: &str, app_dir: &Path) -> Option<String> {
  let label = plist_string_value(contents, "Label")?;
  if label == current_label || !label.ends_with(".devdiary.background") {
    return None;
  }
  devdiary_background_plist_has_ownership_markers(contents, app_dir).then_some(label)
}

fn devdiary_background_plist_has_ownership_markers(contents: &str, app_dir: &Path) -> bool {
  let has_launcher = contents.contains("devdiary-background-launcher.sh");
  let has_run_arg = contents.contains("<string>run</string>");
  let logs_marker = app_dir.join("logs").to_string_lossy().to_string();
  let writes_devdiary_logs = contents.contains(&logs_marker);
  has_launcher && has_run_arg && writes_devdiary_logs
}

fn remove_registration_if_current_attempt(registration: &Path, source: &Path) -> Result<bool, String> {
  let metadata = match fs::symlink_metadata(registration) {
    Ok(metadata) => metadata,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
    Err(err) => return Err(format!("read LaunchAgent registration metadata failed: {err}")),
  };
  if !metadata.file_type().is_symlink() {
    return Ok(false);
  }
  let target = fs::read_link(registration).map_err(|err| format!("read LaunchAgent registration link failed: {err}"))?;
  if target != source {
    return Ok(false);
  }
  fs::remove_file(registration).map_err(|err| format!("remove failed LaunchAgent registration failed: {err}"))?;
  Ok(true)
}

fn replace_devdiary_registration_link(registration: &Path, source: &Path, label: &str, app_dir: &Path) -> Result<(), String> {
  match fs::symlink_metadata(registration) {
    Ok(metadata) => {
      let exact_current_link = metadata.file_type().is_symlink()
        && fs::read_link(registration).map(|target| target == source).unwrap_or(false);
      let owned_plist = fs::read_to_string(registration)
        .ok()
        .map(|contents| {
          plist_string_value(&contents, "Label").as_deref() == Some(label)
            && devdiary_background_plist_has_ownership_markers(&contents, app_dir)
        })
        .unwrap_or(false);
      if !exact_current_link && !owned_plist {
        return Err("existing LaunchAgent registration is not owned by DevDiary".to_string());
      }
      fs::remove_file(registration).map_err(|err| format!("remove existing DevDiary LaunchAgent registration failed: {err}"))?;
    }
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
    Err(err) => return Err(format!("read LaunchAgent registration metadata failed: {err}")),
  }
  symlink(source, registration).map_err(|err| format!("symlink LaunchAgent failed: {err}"))
}

fn cleanup_legacy_background_launch_agents(link_dir: &Path, domain: &str, current_label: &str, app_dir: &Path) -> Result<(), String> {
  let entries = match fs::read_dir(link_dir) {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(format!("read LaunchAgents dir failed: {err}")),
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.extension().and_then(|value| value.to_str()) != Some("plist") {
      continue;
    }
    let contents = match fs::read_to_string(&path) {
      Ok(contents) => contents,
      Err(_) => continue,
    };
    let Some(label) = legacy_devdiary_background_label(&contents, current_label, app_dir) else { continue };
    let target = format!("{domain}/{label}");
    let _ = Command::new("/bin/launchctl").arg("bootout").arg(domain).arg(&path).status();
    let _ = Command::new("/bin/launchctl").arg("bootout").arg(&target).status();
    fs::remove_file(&path).map_err(|err| format!("remove legacy LaunchAgent plist failed: {err}"))?;
    let printed = Command::new("/bin/launchctl").arg("print").arg(&target).status();
    if matches!(printed, Ok(status) if status.success()) {
      return Err(format!("legacy LaunchAgent {label} remains loaded after removal"));
    }
    append_core_log(&format!("Removed legacy DevDiary background LaunchAgent {label}"));
  }
  Ok(())
}

fn install_background_launch_agent(core_dir: &Path) -> Result<(), String> {
  let label = "com.ysjblog.devdiary.background";
  let app_dir = app_data_dir().ok_or_else(|| "HOME is unavailable for LaunchAgent install".to_string())?;
  let home = env::var_os("HOME").map(PathBuf::from).ok_or_else(|| "HOME is unavailable for LaunchAgent install".to_string())?;
  let uid = current_uid().ok_or_else(|| "could not resolve current uid".to_string())?;
  let domain = format!("gui/{uid}");
  let link_dir = home.join("Library").join("LaunchAgents");
  let plist_path = link_dir.join(format!("{label}.plist"));
  let log_dir = app_dir.join("logs");

  create_dir_all(&log_dir).map_err(|err| format!("create log dir failed: {err}"))?;
  let base_dir = resolve_launch_agent_storage_dir(&app_dir, core_dir);
  let launcher = base_dir.join("bin").join("devdiary-background-launcher.sh");
  let source_plist_path = base_dir.join(format!("{label}.plist"));
  write_executable_file(&launcher, &background_launcher_script(core_dir, &app_dir))?;
  let source_contents = background_launch_agent_plist(label, &launcher, core_dir, &log_dir);
  prepare_validated_launch_agent_source(&source_plist_path, &source_contents, |candidate_path| {
    let lint = Command::new("/usr/bin/plutil")
      .arg("-lint")
      .arg(candidate_path)
      .status()
      .map_err(|err| format!("plutil failed to start: {err}"))?;
    lint
      .success()
      .then_some(())
      .ok_or_else(|| "LaunchAgent plist failed plutil validation".to_string())
  })?;

  cleanup_legacy_background_launch_agents(&link_dir, &domain, label, &app_dir)?;
  create_dir_all(&link_dir).map_err(|err| format!("create LaunchAgents dir failed: {err}"))?;
  replace_devdiary_registration_link(&plist_path, &source_plist_path, label, &app_dir)?;

  let _ = Command::new("/bin/launchctl")
    .arg("bootout")
    .arg(&domain)
    .arg(&plist_path)
    .status();
  let bootstrap = Command::new("/bin/launchctl")
    .arg("bootstrap")
    .arg(&domain)
    .arg(&plist_path)
    .status();
  match bootstrap {
    Ok(status) if status.success() => {}
    Ok(_) => {
      remove_registration_if_current_attempt(&plist_path, &source_plist_path)?;
      return Err("launchctl bootstrap failed".to_string());
    }
    Err(err) => {
      remove_registration_if_current_attempt(&plist_path, &source_plist_path)?;
      return Err(format!("launchctl bootstrap failed to start: {err}"));
    }
  }
  let _ = Command::new("/bin/launchctl")
    .arg("enable")
    .arg(format!("{domain}/{label}"))
    .status();
  let _ = Command::new("/bin/launchctl")
    .arg("kickstart")
    .arg("-k")
    .arg(format!("{domain}/{label}"))
    .status();

  append_core_log(&format!(
    "Installed DevDiary background LaunchAgent at {} -> {}",
    plist_path.display(),
    source_plist_path.display()
  ));
  Ok(())
}

fn spawn_core<R: tauri::Runtime>(app: &tauri::App<R>) -> Option<Child> {
  let core_dir = resolve_core_dir(app)?;
  let port = env::var("DEVDIARY_PORT").unwrap_or_else(|_| "4317".to_string());
  let launch_path = core_launch_path();
  let node_bin = match resolve_core_node(&core_dir) {
    Some(path) => path,
    None => {
      append_core_log("DevDiary Core could not start: no executable Node.js runtime was found.");
      return None;
    }
  };
  let mut command = Command::new("/bin/zsh");
  command.process_group(0);
  command.env_clear();
  for key in ["HOME", "TMPDIR", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE"] {
    if let Ok(value) = env::var(key) {
      command.env(key, value);
    }
  }
  command
    .current_dir(&core_dir)
    .env("DEVDIARY_PORT", port)
    .env("DEVDIARY_APP_RUNTIME", "tauri")
    .env("DEVDIARY_TAURI_PARENT_PID", std::process::id().to_string())
    .env("PATH", &launch_path)
    .arg("-lc")
    .arg(format!("parent=\"$DEVDIARY_TAURI_PARENT_PID\"; {} ./node_modules/tsx/dist/cli.mjs src/index.ts & child=$!; trap 'kill \"$child\" 2>/dev/null' INT TERM EXIT; while kill -0 \"$parent\" 2>/dev/null; do kill -0 \"$child\" 2>/dev/null || {{ wait \"$child\"; exit $?; }}; sleep 1; done; kill \"$child\" 2>/dev/null; wait \"$child\" 2>/dev/null", shell_quote(&node_bin)))
    .stdin(Stdio::null());

  if let Some(mut log_file) = open_core_log() {
    let _ = writeln!(
      log_file,
      "\n--- launching DevDiary Core from Tauri (node={}, core={}) ---",
      node_bin.display(),
      core_dir.display()
    );
    if let Ok(stdout_file) = log_file.try_clone() {
      command.stdout(Stdio::from(stdout_file));
    }
    command.stderr(Stdio::from(log_file));
  } else {
    command.stdout(Stdio::null()).stderr(Stdio::null());
  }

  let child = command.spawn();

  match child {
    Ok(child) => Some(child),
    Err(err) => {
      eprintln!("DevDiary Core failed to start from Tauri shell: {err}");
      None
    }
  }
}

#[tauri::command]
fn open_project_folder(path: String) -> Result<(), String> {
  if path.contains('\0') {
    return Err("路徑包含無效字元。".to_string());
  }
  let target = PathBuf::from(path.trim());
  if !target.is_absolute() {
    return Err("只能開啟 macOS 絕對路徑。".to_string());
  }
  if !target.is_dir() {
    return Err("專案資料夾不存在或不是資料夾。".to_string());
  }
  let status = Command::new("/usr/bin/open")
    .arg(&target)
    .status()
    .map_err(|_| "無法啟動 Finder。".to_string())?;
  if status.success() {
    Ok(())
  } else {
    Err("Finder 無法開啟這個資料夾。".to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![open_project_folder, resolve_core_api_origin])
    .manage(CoreProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      if let Some(core_dir) = resolve_core_dir(app) {
        if let Err(err) = install_background_launch_agent(&core_dir) {
          append_core_log(&format!("DevDiary background LaunchAgent install failed: {err}"));
        }
      }
      if let Some(child) = spawn_core(app) {
        let state = app.state::<CoreProcess>();
        if let Ok(mut guard) = state.0.lock() {
          *guard = Some(child);
        };
      }
      if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
          if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            app_handle.state::<CoreProcess>().terminate();
          }
        });
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::{
    background_launch_agent_plist, fallback_core_api_origin_from_port, first_executable_node,
    launch_agent_storage_dir, legacy_devdiary_background_label, remove_registration_if_current_attempt,
    prepare_validated_launch_agent_source, replace_devdiary_registration_link, resolve_core_api_origin_from_manifest,
    resolve_launch_agent_storage_dir,
  };
  use std::{fs, os::unix::fs::{symlink, PermissionsExt}, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}, time::{SystemTime, UNIX_EPOCH}};

  static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

  fn temporary_executable(name: &str) -> (PathBuf, PathBuf) {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let directory = std::env::temp_dir().join(format!("devdiary-node-test-{unique}"));
    fs::create_dir_all(&directory).unwrap();
    let executable = directory.join(name);
    fs::write(&executable, "#!/bin/sh\nexit 0\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
    (directory, executable)
  }

  #[test]
  fn launch_agent_files_stay_in_application_support() {
    let app_data_dir = Path::new("/Users/tester/Library/Application Support/DevDiary");
    assert_eq!(
      launch_agent_storage_dir(app_data_dir),
      Path::new("/Users/tester/Library/Application Support/DevDiary/LaunchAgents")
    );
  }

  #[test]
  fn packaged_and_development_launch_agent_files_use_application_support() {
    let app_data_dir = Path::new("/Users/tester/Library/Application Support/DevDiary");
    let core_dir = Path::new("/Applications/DevDiary.app/Contents/Resources/core");
    assert_eq!(
      resolve_launch_agent_storage_dir(app_data_dir, core_dir),
      Path::new("/Users/tester/Library/Application Support/DevDiary/LaunchAgents")
    );
    assert_eq!(
      resolve_launch_agent_storage_dir(app_data_dir, Path::new("/tmp/devdiary/core")),
      Path::new("/Users/tester/Library/Application Support/DevDiary/LaunchAgents")
    );
  }

  #[test]
  fn failed_attempt_cleanup_removes_only_its_exact_registration_link() {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let directory = std::env::temp_dir().join(format!("devdiary-launch-agent-cleanup-{unique}"));
    fs::create_dir_all(&directory).unwrap();
    let source = directory.join("source.plist");
    let other_source = directory.join("other.plist");
    let registration = directory.join("registration.plist");
    fs::write(&source, "source").unwrap();
    fs::write(&other_source, "other").unwrap();

    symlink(&source, &registration).unwrap();
    assert_eq!(remove_registration_if_current_attempt(&registration, &source).unwrap(), true);
    assert!(fs::symlink_metadata(&registration).is_err());

    symlink(&other_source, &registration).unwrap();
    assert_eq!(remove_registration_if_current_attempt(&registration, &source).unwrap(), false);
    assert_eq!(fs::read_link(&registration).unwrap(), other_source);
    fs::remove_dir_all(directory).unwrap();
  }

  #[test]
  fn registration_replacement_preserves_unrelated_files_and_accepts_owned_devdiary_plists() {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let directory = std::env::temp_dir().join(format!("devdiary-registration-ownership-{unique}"));
    let app_dir = directory.join("Application Support").join("DevDiary");
    let source = app_dir.join("LaunchAgents").join("com.ysjblog.devdiary.background.plist");
    let registration = directory.join("Library").join("LaunchAgents").join("com.ysjblog.devdiary.background.plist");
    fs::create_dir_all(source.parent().unwrap()).unwrap();
    fs::create_dir_all(registration.parent().unwrap()).unwrap();
    fs::write(&source, "source").unwrap();
    fs::write(&registration, "unrelated").unwrap();

    assert!(replace_devdiary_registration_link(
      &registration, &source, "com.ysjblog.devdiary.background", &app_dir,
    ).is_err());
    assert_eq!(fs::read_to_string(&registration).unwrap(), "unrelated");

    let owned = background_launch_agent_plist(
      "com.ysjblog.devdiary.background",
      &app_dir.join("LaunchAgents/bin/devdiary-background-launcher.sh"),
      Path::new("/tmp/devdiary/core"),
      &app_dir.join("logs"),
    );
    fs::write(&registration, owned).unwrap();
    replace_devdiary_registration_link(
      &registration, &source, "com.ysjblog.devdiary.background", &app_dir,
    ).unwrap();
    assert_eq!(fs::read_link(&registration).unwrap(), source);
    fs::remove_dir_all(directory).unwrap();
  }

  #[test]
  fn source_plist_lint_precedes_registration_replacement() {
    let source = include_str!("lib.rs");
    let install = source.split_once("fn install_background_launch_agent").unwrap().1;
    let lint_source = install.find("prepare_validated_launch_agent_source").unwrap();
    let replace_registration = install.find("replace_devdiary_registration_link").unwrap();
    assert!(lint_source < replace_registration);
  }

  #[test]
  fn failed_source_validation_preserves_the_live_source_and_removes_the_candidate() {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let directory = std::env::temp_dir().join(format!("devdiary-source-validation-{unique}"));
    let source = directory.join("com.ysjblog.devdiary.background.plist");
    fs::create_dir_all(&directory).unwrap();
    fs::write(&source, "known-good-live-source").unwrap();

    let result = prepare_validated_launch_agent_source(&source, "invalid-candidate", |_| {
      Err("synthetic lint failure".to_string())
    });

    assert!(result.is_err());
    assert_eq!(fs::read_to_string(&source).unwrap(), "known-good-live-source");
    assert!(!directory.join("com.ysjblog.devdiary.background.plist.candidate").exists());
    fs::remove_dir_all(directory).unwrap();
  }

  #[test]
  fn core_node_resolution_falls_back_when_the_homebrew_node22_path_is_missing() {
    let (directory, fallback) = temporary_executable("node");
    let resolved = first_executable_node(&[
      directory.join("missing-node"),
      fallback.clone(),
    ]);
    assert_eq!(resolved, Some(fallback));
    fs::remove_dir_all(directory).unwrap();
  }

  #[test]
  fn core_node_resolution_keeps_the_first_available_runtime() {
    let (first_dir, first) = temporary_executable("node-first");
    let (second_dir, second) = temporary_executable("node-second");
    let resolved = first_executable_node(&[first.clone(), second]);
    assert_eq!(resolved, Some(first));
    fs::remove_dir_all(first_dir).unwrap();
    fs::remove_dir_all(second_dir).unwrap();
  }

  #[test]
  fn core_node_resolution_prefers_the_bundled_runtime() {
    let (bundle_dir, bundled_node) = temporary_executable("node");
    let (fallback_dir, fallback_node) = temporary_executable("node-fallback");
    let resolved = first_executable_node(&[bundled_node.clone(), fallback_node]);
    assert_eq!(resolved, Some(bundled_node));
    fs::remove_dir_all(bundle_dir).unwrap();
    fs::remove_dir_all(fallback_dir).unwrap();
  }

  #[test]
  fn legacy_background_cleanup_requires_all_devdiary_ownership_markers() {
    let app_dir = Path::new("/tmp/DevDiary");
    let accepted = r#"<key>Label</key><string>legacy.devdiary.background</string><key>ProgramArguments</key><array><string>/tmp/devdiary-background-launcher.sh</string><string>run</string></array><key>StandardOutPath</key><string>/tmp/DevDiary/logs/background.out</string>"#;
    assert_eq!(
      legacy_devdiary_background_label(accepted, "current.devdiary.background", app_dir),
      Some("legacy.devdiary.background".to_string())
    );
    let missing_run = accepted.replace("<string>run</string>", "<string>once</string>");
    assert_eq!(legacy_devdiary_background_label(&missing_run, "current.devdiary.background", app_dir), None);
    let unrelated_logs = accepted.replace("/tmp/DevDiary/logs", "/tmp/other/logs");
    assert_eq!(legacy_devdiary_background_label(&unrelated_logs, "current.devdiary.background", app_dir), None);
  }

  fn temporary_manifest(contents: &str) -> (PathBuf, PathBuf) {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let directory = std::env::temp_dir().join(format!("devdiary-manifest-test-{unique}-{sequence}"));
    fs::create_dir_all(&directory).unwrap();
    let manifest = directory.join("core-runtime.json");
    fs::write(&manifest, contents).unwrap();
    (directory, manifest)
  }

  #[test]
  fn core_api_origin_reads_the_bound_port_from_a_live_manifest() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322,"pid":4242}}"#,
    );
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |pid| pid == 4242);
    assert_eq!(resolved, Some("http://127.0.0.1:4322".to_string()));
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_accepts_integral_json_number_encodings_like_the_js_consumer() {
    for contents in [
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322.0,"pid":4242.0}}"#,
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4.322e3,"pid":4.242e3}}"#,
    ] {
      let (dir, manifest) = temporary_manifest(contents);
      assert_eq!(
        resolve_core_api_origin_from_manifest(&manifest, |pid| pid == 4242),
        Some("http://127.0.0.1:4322".to_string()),
        "{contents}",
      );
      fs::remove_dir_all(dir).unwrap();
    }
  }

  #[test]
  fn core_api_origin_ignores_a_manifest_whose_owner_pid_is_dead() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322,"pid":999999}}"#,
    );
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |_| false);
    assert_eq!(resolved, None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_ignores_a_non_loopback_manifest() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"devdiary-core","runtime":{"host":"example.com","port":4322,"pid":4242}}"#,
    );
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |_| true);
    assert_eq!(resolved, None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_ignores_a_manifest_with_the_wrong_service_name() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"something-else","runtime":{"host":"127.0.0.1","port":4322,"pid":4242}}"#,
    );
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |_| true);
    assert_eq!(resolved, None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_ignores_malformed_json() {
    let (dir, manifest) = temporary_manifest("not json");
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |_| true);
    assert_eq!(resolved, None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_ignores_a_missing_manifest_file() {
    let missing = std::env::temp_dir().join("devdiary-manifest-test-missing/core-runtime.json");
    let resolved = resolve_core_api_origin_from_manifest(&missing, |_| true);
    assert_eq!(resolved, None);
  }

  #[test]
  fn core_api_origin_rejects_a_manifest_with_no_pid() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322}}"#,
    );
    let resolved = resolve_core_api_origin_from_manifest(&manifest, |_| false);
    assert_eq!(resolved, None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn core_api_origin_requires_positive_numeric_pid_and_bounded_port() {
    for contents in [
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322,"pid":"4242"}}"#,
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322,"pid":0}}"#,
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322,"pid":-1}}"#,
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":65536,"pid":4242}}"#,
      r#"{"service":"devdiary-core","runtime":{"host":"127.0.0.1","port":4322.5,"pid":4242}}"#,
    ] {
      let (dir, manifest) = temporary_manifest(contents);
      assert_eq!(resolve_core_api_origin_from_manifest(&manifest, |_| true), None, "{contents}");
      fs::remove_dir_all(dir).unwrap();
    }
  }

  #[test]
  fn core_api_origin_rejects_top_level_url_runtime_disagreement() {
    let (dir, manifest) = temporary_manifest(
      r#"{"service":"devdiary-core","url":"http://127.0.0.1:4999","runtime":{"host":"127.0.0.1","port":4322,"pid":4242}}"#,
    );
    assert_eq!(resolve_core_api_origin_from_manifest(&manifest, |_| true), None);
    fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn fixed_port_fallback_is_bounded() {
    assert_eq!(fallback_core_api_origin_from_port(Some("65535")), "http://127.0.0.1:65535");
    assert_eq!(fallback_core_api_origin_from_port(Some(" 4400 ")), "http://127.0.0.1:4400");
    assert_eq!(fallback_core_api_origin_from_port(Some("004400")), "http://127.0.0.1:4400");
    for value in [None, Some(""), Some("0"), Some("-1"), Some("+4400"), Some("65536"), Some("4317.5"), Some("bad")] {
      assert_eq!(fallback_core_api_origin_from_port(value), "http://127.0.0.1:4317");
    }
  }
}
