use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Option<String>,
    pub name: String,
    pub version: String,
    pub cells: BTreeMap<String, Cell>,
    pub drugs: BTreeMap<String, Drug>,
    pub tasks: BTreeMap<String, SimulationTask>,
    #[serde(default)]
    pub custom_functions: BTreeMap<String, Value>,
    #[serde(default)]
    pub custom_units: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    pub id: String,
    pub name: String,
    pub items: Vec<CellItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellItem {
    pub key: String,
    pub conc: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Drug {
    pub id: Option<String>,
    pub key: String,
    pub name: String,
    #[serde(rename = "ref")]
    pub reference: String,
    pub target: String,
    pub ref_conc: f64,
    pub ki: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationTask {
    pub id: Option<String>,
    pub cell_id: String,
    pub name: String,
    pub cell_name: Option<String>,
    pub doses: Vec<DrugDose>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrugDose {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drug_id: Option<String>,
    #[serde(default, skip_serializing)]
    pub drug_key: Option<String>,
    pub pct: f64,
    pub t0: f64,
    pub mode: DoseMode,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum DoseMode {
    #[serde(rename = "konstan")]
    Constant,
    #[serde(rename = "bolus")]
    Bolus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResult {
    pub id: Option<String>,
    pub t: Vec<f64>,
    pub species: BTreeMap<String, Vec<f64>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationBundle {
    pub id: Option<String>,
    pub task_id: Option<String>,
    pub title: String,
    pub cell_name: String,
    pub ran_at: i64,
    pub items: Vec<CellItem>,
    pub control: SimulationResult,
    pub exps: Vec<SimulationExperiment>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationExperiment {
    pub name: String,
    pub color: String,
    pub conc: f64,
    pub t0: f64,
    pub mode: DoseMode,
    pub sim: SimulationResult,
}
