import {
  Cell,
  Drug,
  SimulationTask,
  SimulationResult,
  ExperimentScenario,
  SimulationResultBundle
} from '../domain/entities';
import { DEFAULT_DRUGS, DEFAULT_SPECIES } from '../domain/constants';
import { defaultIpcAdapter, IpcBridge } from '../adapters';

const T_MAX = 300;
const DT = 0.1;
const SAMPLE_EVERY = 5;
const K_ELIM = 0.01;
const ADP_START = 0.8;
const AA_SUPPLY = 0.025;

interface DrugParam {
  target: string;
  ki: number;
  conc: number;
  t0: number;
  mode: 'konstan' | 'bolus';
}

/**
 * Pure TypeScript implementation of the 4th-order Runge-Kutta (RK4) ODE solver.
 * Identical equations and parameters to engine/main.py and docs/prototype/model.js.
 */
export function solveOdeLocally(
  items: Array<{ key: string; conc: number }>,
  drug: DrugParam | null
): SimulationResult {
  const getConc = (k: string) => {
    const it = items.find((x) => x.key === k);
    return it !== undefined ? it.conc : null;
  };

  const gC = getConc('glukosa');
  const atpC = getConc('atp');
  const aaC = getConc('aa');

  const Gext = gC === null ? 0 : gC;
  const Ehk = getConc('hk') || 0;
  const Ecox = getConc('cox') || 0;
  const Eglut = getConc('glut') || 0;
  const ATP0 = atpC === null ? 0 : atpC;
  const ADP0 = atpC === null ? 0 : ADP_START;
  const supply = aaC === null ? 0 : AA_SUPPLY;

  const inh = (t: number, target: string) => {
    if (!drug || drug.target !== target || t < drug.t0) return 1;
    const I = drug.mode === 'bolus' ? drug.conc * Math.exp(-K_ELIM * (t - drug.t0)) : drug.conc;
    return 1 / (1 + I / drug.ki);
  };

  // State: [G, G6P, ATP, ADP, Pyr, AA, PGE2]
  const f = (t: number, s: number[]) => {
    const G = s[0];
    const G6P = s[1];
    const ATP = s[2];
    const ADP = s[3];
    const AA = s[5];
    const PGE = s[6];

    const vin = 0.05 * (Eglut / 0.01) * (Gext - G);
    const vhk = 5 * Ehk * (G / (0.1 + G)) * (ATP / (0.5 + ATP)) * inh(t, 'hk');
    const vgl = 0.5 * G6P * (ADP / (0.2 + ADP));
    const vatp = 0.03 * ATP;
    const vcox = 3 * Ecox * (AA / (0.05 + AA)) * inh(t, 'cox');
    const vpge = 0.05 * PGE;

    return [
      vin - vhk,
      vhk - vgl,
      -vhk + 2 * vgl - vatp,
      vhk - 2 * vgl + vatp,
      vgl,
      supply - vcox,
      vcox - vpge
    ];
  };

  let s = [Gext, 0, ATP0, ADP0, 0, aaC === null ? 0 : aaC, 0];
  const n = s.length;
  const out: SimulationResult = { t: [], species: {} };
  DEFAULT_SPECIES.forEach((sp) => {
    out.species[sp.key] = [];
  });

  const rec = (t: number) => {
    out.t.push(Math.round(t * 100) / 100);
    DEFAULT_SPECIES.forEach((sp, i) => {
      out.species[sp.key].push(s[i]);
    });
  };

  const steps = Math.round(T_MAX / DT);
  rec(0);
  for (let step = 1; step <= steps; step++) {
    const t = (step - 1) * DT;
    const k1 = f(t, s);
    const k2 = f(t + DT / 2, s.map((v, i) => v + (DT / 2) * k1[i]));
    const k3 = f(t + DT / 2, s.map((v, i) => v + (DT / 2) * k2[i]));
    const k4 = f(t + DT, s.map((v, i) => v + DT * k3[i]));

    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = s[i] + (DT / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      next[i] = v < 0 ? 0 : v;
    }
    s = next;
    if (step % SAMPLE_EVERY === 0) {
      rec(step * DT);
    }
  }

  return out;
}

const EXP_COLORS = ['#D85A30', '#7F77DD', '#1D9E75', '#BA7517'];

/**
 * Execute simulation scenarios for a task:
 * 1. Control run (no drug)
 * 2. Multi-scenario per-dose runs
 * Tries backend IPC first; falls back to exact local RK4 solver if host is not yet connected.
 */
export async function runTaskSimulation(
  cell: Cell,
  task: SimulationTask,
  allDrugs: Record<string, Drug> = DEFAULT_DRUGS,
  ipc: IpcBridge = defaultIpcAdapter
): Promise<SimulationResultBundle> {
  const items = cell.items.map((i) => ({ key: i.key, conc: i.conc }));

  // 1. Run Control (without drug)
  let controlResult: SimulationResult;
  try {
    controlResult = await ipc.runSimulation({
      cell,
      task: { ...task, cellId: cell.id, doses: [] },
      drugs: allDrugs
    });
  } catch {
    // Fallback: local ODE solver
    controlResult = solveOdeLocally(items, null);
  }

  // 2. Run Experiments (one per dose)
  const exps: ExperimentScenario[] = [];
  for (let idx = 0; idx < task.doses.length; idx++) {
    const dose = task.doses[idx];
    const drug = allDrugs[dose.drugKey] || DEFAULT_DRUGS[dose.drugKey];
    if (!drug) continue;

    const conc = (dose.pct / 100) * drug.refConc;
    const drugParam: DrugParam = {
      target: drug.target,
      ki: drug.ki,
      conc,
      t0: dose.t0,
      mode: dose.mode
    };

    let sim: SimulationResult;
    try {
      sim = await ipc.runSimulation({
        cell,
        task: { ...task, cellId: cell.id, doses: [dose] },
        drugs: allDrugs
      });
    } catch {
      sim = solveOdeLocally(items, drugParam);
    }

    exps.push({
      name: `${drug.name} ${dose.pct}% @ ${dose.t0} s (${dose.mode})`,
      color: EXP_COLORS[idx % EXP_COLORS.length],
      conc,
      t0: dose.t0,
      mode: dose.mode,
      sim
    });
  }

  return {
    title: task.name,
    cellName: cell.name,
    ranAt: Date.now(),
    items,
    control: controlResult,
    exps
  };
}

