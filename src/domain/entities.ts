export type SubstanceCategory = 'metabolit' | 'enzim' | 'transporter' | 'obat';
export type Compartment = 'sitoplasma' | 'membran';
export type DoseMode = 'konstan' | 'bolus';

export interface CatalogItem {
  key: string;
  name: string;
  cat: SubstanceCategory;
  comp: Compartment;
  ref: string;
  def: number;
  min: number;
  max: number;
  step: number;
  hint: string;
}

export interface Drug {
  id?: string;
  key: string;
  name: string;
  ref: string;
  target: string;
  refConc: number;
  ki: number;
}

export interface Species {
  key: string;
  name: string;
}

export interface Reaction {
  id: string;
  name: string;
  eq: string;
  needs: string[];
  requires?: string[];
}

export interface CellItem {
  key: string;
  conc: number;
}

export interface Cell {
  id: string;
  name: string;
  items: CellItem[];
}

export interface DrugDose {
  drugKey: string;
  pct: number;
  t0: number;
  mode: DoseMode;
}

export interface SimulationTask {
  id?: string;
  cellId: string;
  name: string;
  cellName?: string;
  doses: DrugDose[];
}

export interface SimulationResult {
  id?: string;
  t: number[];
  species: Record<string, number[]>;
}

export interface StoredSimulationResult extends SimulationResult {
  id: string;
  taskId: string;
  timestamp: string;
}

export interface ExperimentScenario {
  name: string;
  color: string;
  conc: number;
  t0: number;
  mode: DoseMode;
  sim: SimulationResult;
}

export interface SimulationResultBundle {
  id?: string;
  taskId?: string;
  title: string;
  cellName: string;
  ranAt: number;
  items: CellItem[];
  control: SimulationResult;
  exps: ExperimentScenario[];
}

export interface StoredSimulationRun {
  id: string;
  taskId: string;
  createdAtMs: number;
  bundle: SimulationResultBundle;
}

export interface Project {
  id?: string;
  name: string;
  version: string;
  cells: Record<string, Cell>;
  drugs: Record<string, Drug>;
  tasks: Record<string, SimulationTask>;
  customFunctions: Record<string, Record<string, unknown>>;
  customUnits: Record<string, Record<string, unknown>>;
}
