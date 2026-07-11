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

fn launch_agent_storage_dir(app_dir: &Path) -> PathBuf {
  app_dir.join("LaunchAgents")
}

fn packaged_launch_agent_storage_dir(core_dir: &Path) -> Option<PathBuf> {
  core_dir
    .ancestors()
    .find(|path| path.extension().map(|extension| extension == "app").unwrap_or(false))
    .and_then(Path::parent)
    .map(|parent| parent.join(".DevDiaryLaunchAgents"))
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
  let package_storage_dir = packaged_launch_agent_storage_dir(core_dir);
  let base_dir = package_storage_dir.clone().unwrap_or_else(|| launch_agent_storage_dir(&app_dir));
  let launcher = base_dir.join("bin").join("devdiary-background-launcher.sh");
  let source_plist_path = base_dir.join(format!("{label}.plist"));
  write_executable_file(&launcher, &background_launcher_script(core_dir, &app_dir))?;
  create_dir_all(&link_dir).map_err(|err| format!("create LaunchAgents dir failed: {err}"))?;
  let _ = fs::remove_file(&plist_path);
  write_private_file(&source_plist_path, &background_launch_agent_plist(label, &launcher, core_dir, &log_dir))?;
  if package_storage_dir.is_some() {
    symlink(&source_plist_path, &plist_path).map_err(|err| format!("symlink LaunchAgent failed: {err}"))?;
  } else {
    fs::rename(&source_plist_path, &plist_path).map_err(|err| format!("install LaunchAgent plist failed: {err}"))?;
  }

  let lint = Command::new("/usr/bin/plutil")
    .arg("-lint")
    .arg(&plist_path)
    .status()
    .map_err(|err| format!("plutil failed to start: {err}"))?;
  if !lint.success() {
    return Err("LaunchAgent plist failed plutil validation".to_string());
  }

  let _ = Command::new("/bin/launchctl")
    .arg("bootout")
    .arg(&domain)
    .arg(&plist_path)
    .status();
  let bootstrap = Command::new("/bin/launchctl")
    .arg("bootstrap")
    .arg(&domain)
    .arg(&plist_path)
    .status()
    .map_err(|err| format!("launchctl bootstrap failed to start: {err}"))?;
  if !bootstrap.success() {
    return Err("launchctl bootstrap failed".to_string());
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
    .invoke_handler(tauri::generate_handler![open_project_folder])
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
  use super::{first_executable_node, launch_agent_storage_dir, packaged_launch_agent_storage_dir};
  use std::{fs, os::unix::fs::PermissionsExt, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

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
  fn packaged_launch_agent_files_stay_beside_the_app_bundle() {
    let core_dir = Path::new("/Applications/DevDiary.app/Contents/Resources/core");
    assert_eq!(
      packaged_launch_agent_storage_dir(core_dir),
      Some(Path::new("/Applications/.DevDiaryLaunchAgents").to_path_buf())
    );
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
}
