mod project_file;

use project_file::{Cell, CellItem, Drug, DrugDose, DoseMode, Project, SimulationBundle, SimulationResult, SimulationTask};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Deserialize)]
struct PythonEngineResponse<T> {
    jsonrpc: String,
    id: Value,
    result: Option<T>,
    error: Option<PythonEngineError>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PythonEngineStatus {
    status: String,
    engine: String,
    python_version: String,
}

#[derive(Debug, Deserialize)]
struct PythonEngineError {
    code: i64,
    message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationRequest {
    cell: Cell,
    task: SimulationTask,
    drugs: BTreeMap<String, Drug>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineDrug {
    target: String,
    ki: f64,
    conc: f64,
    t0: f64,
    mode: DoseMode,
}

#[derive(Serialize)]
struct EngineParams<'a> {
    items: &'a [CellItem],
    drug: Option<EngineDrug>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFileEnvelope {
    format: String,
    version: u32,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    project_name: Option<String>,
    #[serde(default)]
    project_version: Option<String>,
    #[serde(default)]
    project: Option<Project>,
}

#[derive(Debug, Deserialize, Serialize)]
struct CustomEntry {
    key: String,
    definition: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFileLocation {
    project: Project,
    path: String,
    #[serde(default)]
    simulation_runs: Vec<SimulationBundle>,
}

fn sanitize_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') { character } else { '_' })
        .collect();
    if sanitized.is_empty() { "CellLabProject".to_string() } else { sanitized }
}

fn folder_project_name(folder: &std::path::Path, fallback: &str) -> String {
    folder
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.strip_suffix(".celllab").unwrap_or(name).to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn write_json(path: &std::path::Path, value: &impl Serialize) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not encode {}: {error}", path.display()))?;
    std::fs::write(path, json)
        .map_err(|error| format!("Could not write {}: {error}", path.display()))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &std::path::Path) -> Result<T, String> {
    let json = std::fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    serde_json::from_str(&json)
        .map_err(|error| format!("Invalid JSON in {}: {error}", path.display()))
}

fn read_json_files<T: for<'de> Deserialize<'de>>(directory: &std::path::Path) -> Result<Vec<T>, String> {
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut entries = std::fs::read_dir(directory)
        .map_err(|error| format!("Could not list {}: {error}", directory.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?;
    entries.sort_by_key(|entry| entry.file_name());
    entries
        .into_iter()
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .map(|entry| read_json(&entry.path()))
        .collect()
}

fn clear_json_files(directory: &std::path::Path) -> Result<(), String> {
    if !directory.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(directory)
        .map_err(|error| format!("Could not list {}: {error}", directory.display()))?
    {
        let path = entry
            .map_err(|error| format!("Could not read {}: {error}", directory.display()))?
            .path();
        if path.extension().and_then(|value| value.to_str()) == Some("json") {
            std::fs::remove_file(&path)
                .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

fn normalize_project_drug_references(project: &mut Project) -> Result<(), String> {
    for drug in project.drugs.values_mut() {
        if drug.id.is_none() {
            drug.id = Some(format!("drug-{}", drug.key));
        }
    }
    let drug_ids: Vec<(String, String)> = project
        .drugs
        .values()
        .filter_map(|drug| drug.id.clone().map(|id| (id, drug.key.clone())))
        .collect();

    for task in project.tasks.values_mut() {
        for dose in &mut task.doses {
            let reference = dose
                .drug_id
                .take()
                .or_else(|| dose.drug_key.take())
                .ok_or_else(|| format!("Task '{}' contains a dose without drugId", task.name))?;
            let drug_id = drug_ids
                .iter()
                .find(|(id, key)| id == &reference || key == &reference)
                .map(|(id, _)| id.clone())
                .ok_or_else(|| format!("Task '{}' references unknown drug '{}'", task.name, reference))?;
            dose.drug_id = Some(drug_id);
        }
    }
    Ok(())
}

#[tauri::command]
async fn verify_python_engine() -> Result<PythonEngineStatus, String> {
    match tauri::async_runtime::spawn_blocking(run_python_health_check).await {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => {
            eprintln!("[CellLab][verify_python_engine] {error}");
            Err(error)
        }
        Err(error) => {
            let message = format!("Python engine task failed: {error}");
            eprintln!("[CellLab][verify_python_engine] {message}");
            Err(message)
        }
    }
}

#[tauri::command]
async fn run_simulation(
    request: SimulationRequest,
) -> Result<SimulationResult, String> {
    match tauri::async_runtime::spawn_blocking(move || run_python_simulation(request)).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(error)) => {
            eprintln!("[CellLab][run_simulation] {error}");
            Err(error)
        }
        Err(error) => {
            let message = format!("Simulation task failed: {error}");
            eprintln!("[CellLab][run_simulation] {message}");
            Err(message)
        }
    }
}

#[tauri::command]
fn save_project_file(
    path: String,
    project: Project,
    simulation_runs: Vec<SimulationBundle>,
) -> Result<ProjectFileLocation, String> {
    if path.trim().is_empty() {
        return Err("Project file path must not be empty".to_string());
    }

    let parent = std::path::PathBuf::from(&path);
    let target = if parent.join("project.json").is_file() {
        parent
    } else {
        parent.join(sanitize_name(&project.name))
    };
    let mut project = project;
    project.name = folder_project_name(&target, &project.name);
    std::fs::create_dir_all(target.join("model").join("cells"))
        .and_then(|_| std::fs::create_dir_all(target.join("model").join("drugs")))
        .and_then(|_| std::fs::create_dir_all(target.join("tasks")))
        .and_then(|_| std::fs::create_dir_all(target.join("functions")))
        .and_then(|_| std::fs::create_dir_all(target.join("units")))
        .and_then(|_| std::fs::create_dir_all(target.join("results")))
        .map_err(|error| format!("Could not create project folder: {error}"))?;
    for directory in [
        target.join("model").join("cells"),
        target.join("model").join("drugs"),
        target.join("tasks"),
        target.join("functions"),
        target.join("units"),
        target.join("results"),
    ] {
        clear_json_files(&directory)?;
    }
    for legacy_file in [
        target.join("model").join("model.json"),
        target.join("tasks").join("tasks.json"),
        target.join("functions").join("custom-functions.json"),
        target.join("units").join("custom-units.json"),
        target.join("results").join("runs.json"),
    ] {
        let _ = std::fs::remove_file(legacy_file);
    }

    let envelope = ProjectFileEnvelope {
        format: "celllab-project".to_string(),
        version: 3,
        project_id: project.id.clone(),
        project_name: Some(project.name.clone()),
        project_version: Some(project.version.clone()),
        project: None,
    };
    let temporary = target.join("project.json.tmp");
    write_json(&temporary, &envelope)?;
    let project_json = target.join("project.json");
    if project_json.exists() {
        std::fs::remove_file(&project_json)
            .map_err(|error| format!("Could not replace existing project file: {error}"))?;
    }
    std::fs::rename(&temporary, &project_json)
        .map_err(|error| format!("Could not finalize project file: {error}"))?;
    for (index, cell) in project.cells.values().enumerate() {
        write_json(&target.join("model").join("cells").join(format!("{index:04}-{}.json", sanitize_name(&cell.id))), cell)?;
    }
    for (index, drug) in project.drugs.values().enumerate() {
        let drug_id = drug.id.as_deref().unwrap_or(&drug.key);
        write_json(&target.join("model").join("drugs").join(format!("{index:04}-{}.json", sanitize_name(drug_id))), drug)?;
    }
    for (index, task) in project.tasks.values().enumerate() {
        let task_id = task.id.as_deref().unwrap_or(&task.name);
        write_json(&target.join("tasks").join(format!("{index:04}-{}.json", sanitize_name(task_id))), task)?;
    }
    for (index, (key, definition)) in project.custom_functions.iter().enumerate() {
        write_json(&target.join("functions").join(format!("{index:04}-{}.json", sanitize_name(key))), &CustomEntry { key: key.clone(), definition: definition.clone() })?;
    }
    for (index, (key, definition)) in project.custom_units.iter().enumerate() {
        write_json(&target.join("units").join(format!("{index:04}-{}.json", sanitize_name(key))), &CustomEntry { key: key.clone(), definition: definition.clone() })?;
    }
    for (index, run) in simulation_runs.iter().enumerate() {
        write_json(&target.join("results").join(format!("{index:04}-{}.json", sanitize_name(&run.title))), run)?;
    }
    Ok(ProjectFileLocation {
        project,
        path: target.to_string_lossy().into_owned(),
        simulation_runs,
    })
}

#[tauri::command]
fn load_project_file(path: String) -> Result<ProjectFileLocation, String> {
    if path.trim().is_empty() {
        return Err("Project file path must not be empty".to_string());
    }
    let folder = std::path::PathBuf::from(&path);
    if !folder.is_dir() {
        return Err("Project path must be a folder".to_string());
    }
    if !folder.join("project.json").is_file() {
        return Err("Selected folder is not a CellLab project: project.json is missing".to_string());
    }
    let json = std::fs::read_to_string(folder.join("project.json"))
        .map_err(|error| format!("Could not read project file: {error}"))?;
    let envelope: ProjectFileEnvelope = serde_json::from_str(&json)
        .map_err(|error| format!("Project file is invalid: {error}"))?;
    if envelope.format != "celllab-project" {
        return Err("Unsupported CellLab project folder version".to_string());
    }
    if envelope.version == 1 {
        let mut project = envelope.project.ok_or_else(|| "Legacy project file has no project data".to_string())?;
        project.name = folder_project_name(&folder, &project.name);
        normalize_project_drug_references(&mut project)?;
        let legacy_runs = folder.join("results").join("runs.json");
        let simulation_runs = if legacy_runs.is_file() { read_json(&legacy_runs)? } else { Vec::new() };
        return Ok(ProjectFileLocation { project, path, simulation_runs });
    }
    if !matches!(envelope.version, 2 | 3) {
        return Err("Unsupported CellLab project folder version".to_string());
    }
    let cells = read_json_files(&folder.join("model").join("cells"))?
        .into_iter()
        .map(|cell: Cell| (cell.id.clone(), cell))
        .collect();
    let drugs = read_json_files(&folder.join("model").join("drugs"))?
        .into_iter()
        .map(|mut drug: Drug| {
            if drug.id.is_none() {
                drug.id = Some(format!("drug-{}", drug.key));
            }
            let key = drug.id.clone().unwrap_or_else(|| drug.key.clone());
            (key, drug)
        })
        .collect();
    let tasks = read_json_files(&folder.join("tasks"))?
        .into_iter()
        .map(|task: SimulationTask| {
            let key = task.id.clone().unwrap_or_else(|| task.name.clone());
            (key, task)
        })
        .collect();
    let custom_functions = read_json_files::<CustomEntry>(&folder.join("functions"))?
        .into_iter()
        .map(|entry| (entry.key, entry.definition))
        .collect();
    let custom_units = read_json_files::<CustomEntry>(&folder.join("units"))?
        .into_iter()
        .map(|entry| (entry.key, entry.definition))
        .collect();
    let simulation_runs = read_json_files(&folder.join("results"))?;
    let mut project = Project {
        id: envelope.project_id,
        name: envelope.project_name.ok_or_else(|| "Project manifest has no name".to_string())?,
        version: envelope.project_version.ok_or_else(|| "Project manifest has no version".to_string())?,
        cells,
        drugs,
        tasks,
        custom_functions,
        custom_units,
    };
    project.name = folder_project_name(&folder, &project.name);
    normalize_project_drug_references(&mut project)?;
    Ok(ProjectFileLocation { project, path, simulation_runs })
}

fn run_python_health_check() -> Result<PythonEngineStatus, String> {
    run_python_json_rpc("celllab-health", "health", None)
}

fn run_python_simulation(request: SimulationRequest) -> Result<SimulationResult, String> {
    let params = simulation_params(&request)?;
    let request_id = request
        .task
        .id
        .as_deref()
        .filter(|id| !id.is_empty())
        .unwrap_or("celllab-simulation");
    let result: SimulationResult = run_python_json_rpc(
        request_id,
        "simulate",
        Some(serde_json::to_value(params).map_err(|error| {
            format!("Could not encode simulation parameters: {error}")
        })?),
    )?;
    validate_simulation_result(&result)?;
    Ok(result)
}

fn simulation_params(request: &SimulationRequest) -> Result<EngineParams<'_>, String> {
    if request.cell.id != request.task.cell_id {
        return Err("Simulation task cellId does not match the selected cell ID".to_string());
    }
    if request.cell.items.is_empty() {
        return Err("Simulation cell.items must not be empty".to_string());
    }
    if request.task.doses.len() > 1 {
        return Err("Each simulation run must contain at most one drug dose".to_string());
    }

    let mut item_keys = HashSet::new();
    for item in &request.cell.items {
        if item.key.trim().is_empty()
            || !item.conc.is_finite()
            || item.conc < 0.0
            || !item_keys.insert(&item.key)
        {
            return Err("Simulation cell.items contains an invalid or duplicate item".to_string());
        }
    }

    let drug = request
        .task
        .doses
        .first()
        .map(|dose| resolve_drug(dose, &request.drugs))
        .transpose()?;

    Ok(EngineParams {
        items: &request.cell.items,
        drug,
    })
}

fn resolve_drug(
    dose: &DrugDose,
    drugs: &BTreeMap<String, Drug>,
) -> Result<EngineDrug, String> {
    if !dose.pct.is_finite() || dose.pct < 0.0 || !dose.t0.is_finite() || dose.t0 < 0.0 {
        return Err("Drug dose percentage and administration time must be non-negative".to_string());
    }
    let reference = dose
        .drug_id
        .as_deref()
        .or(dose.drug_key.as_deref())
        .ok_or_else(|| "Drug dose is missing drugId".to_string())?;
    let drug = drugs
        .values()
        .find(|candidate| candidate.id.as_deref() == Some(reference) || candidate.key == reference)
        .ok_or_else(|| format!("Drug '{}' was not found in the project", reference))?;
    if !matches!(drug.target.as_str(), "cox" | "hk")
        || !drug.ki.is_finite()
        || drug.ki <= 0.0
        || !drug.ref_conc.is_finite()
        || drug.ref_conc < 0.0
    {
        return Err(format!("Drug '{}' has invalid inhibition parameters", reference));
    }

    Ok(EngineDrug {
        target: drug.target.clone(),
        ki: drug.ki,
        conc: drug.ref_conc * dose.pct / 100.0,
        t0: dose.t0,
        mode: dose.mode.clone(),
    })
}

fn validate_simulation_result(result: &SimulationResult) -> Result<(), String> {
    const SPECIES: [&str; 7] = ["G", "G6P", "ATP", "ADP", "Pyr", "AA", "PGE2"];

    if result.t.len() != 601
        || result
            .t
            .iter()
            .enumerate()
            .any(|(index, time)| !time.is_finite() || (time - index as f64 * 0.5).abs() > 1e-9)
    {
        return Err("Python engine returned invalid time points; expected 601 samples from 0 to 300 seconds".to_string());
    }
    if result.species.len() != SPECIES.len()
        || SPECIES.iter().any(|key| {
            result.species.get(*key).map_or(true, |values| {
                values.len() != result.t.len()
                    || values.iter().any(|value| !value.is_finite() || *value < 0.0)
            })
        })
    {
        return Err("Python engine returned invalid species series".to_string());
    }
    Ok(())
}

fn run_python_json_rpc<T: DeserializeOwned>(
    request_id: &str,
    method: &str,
    params: Option<Value>,
) -> Result<T, String> {
    let script_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../engine/main.py");
    // shortcut: repository-relative script path; bundle a Tauri sidecar before release packaging.
    if !script_path.is_file() {
        return Err(format!("Python engine script not found: {}", script_path.display()));
    }

    let mut candidates = Vec::new();
    if let Ok(configured_python) = std::env::var("CELLLAB_PYTHON") {
        if !configured_python.trim().is_empty() {
            candidates.push(configured_python);
        }
    }
    if cfg!(windows) {
        candidates.extend(["python".to_string(), "python3".to_string()]);
    } else {
        candidates.extend(["python3".to_string(), "python".to_string()]);
    }

    let mut request = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method
    });
    if let Some(params) = params {
        request["params"] = params;
    }
    let request = serde_json::to_string(&request)
        .map_err(|error| format!("Could not encode Python engine request: {error}"))?;
    let mut launch_error = String::from("No Python executable could be started");

    for candidate in candidates {
        let mut child = match Command::new(&candidate)
            .arg("-u")
            .arg(&script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                launch_error = format!("{candidate}: {error}");
                continue;
            }
        };

        child
            .stdin
            .take()
            .ok_or_else(|| "Python engine stdin is unavailable".to_string())?
            .write_all(format!("{request}\n").as_bytes())
            .map_err(|error| format!("Could not send request to Python engine: {error}"))?;

        let output = child
            .wait_with_output()
            .map_err(|error| format!("Could not read Python engine response: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Python engine exited with {}: {stderr}", output.status));
        }

        let response: PythonEngineResponse<T> = serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("Invalid Python engine response: {error}"))?;
        if response.jsonrpc != "2.0" || response.id.as_str() != Some(request_id) {
            return Err("Python engine response did not match the JSON-RPC request".to_string());
        }
        if let Some(error) = response.error {
            return Err(format!(
                "Python engine error {}: {}",
                error.code, error.message
            ));
        }
        return response
            .result
            .ok_or_else(|| "Python engine response contained no result".to_string());
    }

    Err(launch_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            verify_python_engine,
            run_simulation,
            save_project_file,
            load_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
