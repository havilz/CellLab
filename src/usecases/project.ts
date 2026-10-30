import { Project, Cell, Drug, DrugDose, SimulationTask } from '../domain/entities';
import { DEFAULT_DRUGS } from '../domain/constants';
import builtinCell from '../domain/builtins/cells/sel-standar.json';
import builtinTask from '../domain/builtins/tasks/efek-parasetamol-standar.json';

export function createDefaultProject(
  name = 'Proyek Baru',
  cellId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? `cell-${crypto.randomUUID().slice(0, 8)}`
    : `cell-${Date.now().toString(36)}`,
  taskId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? `task-${crypto.randomUUID().slice(0, 8)}`
    : `task-${Date.now().toString(36)}`
): Project {
  const defaultCell: Cell = {
    id: cellId,
    name: builtinCell.name,
    items: builtinCell.items
  };

  const defaultTask: SimulationTask = {
    id: taskId,
    cellId: defaultCell.id,
    name: builtinTask.name,
    cellName: 'Sel Standar',
    doses: builtinTask.doses as DrugDose[]
  };

  return {
    name,
    version: '1.0.0',
    cells: {
      [defaultCell.id]: defaultCell
    },
    drugs: { ...DEFAULT_DRUGS },
    customFunctions: {},
    customUnits: {},
    tasks: {
      [defaultTask.id || taskId]: defaultTask
    }
  };
}

export function addOrUpdateCell(project: Project, cell: Cell): Project {
  const cells = { ...project.cells };
  const previousKey = Object.keys(cells).find((key) => cells[key].id === cell.id);
  if (previousKey && previousKey !== cell.id) delete cells[previousKey];
  return {
    ...project,
    cells: {
      ...cells,
      [cell.id]: cell
    }
  };
}

export function addOrUpdateDrug(project: Project, drug: Drug): Project {
  const key = drug.id || `drug-${drug.key}`;
  const drugs = { ...project.drugs };
  const previousKey = Object.keys(drugs).find((candidateKey) => {
    const candidate = drugs[candidateKey];
    return (candidate.id || `drug-${candidate.key}`) === key;
  });
  if (previousKey && previousKey !== key) delete drugs[previousKey];
  return {
    ...project,
    drugs: {
      ...drugs,
      [key]: drug
    }
  };
}

export function addOrUpdateTask(project: Project, task: SimulationTask): Project {
  const tasks = { ...project.tasks };
  const taskKey = task.id || task.name;
  const previousKey = Object.keys(tasks).find((key) => {
    const candidate = tasks[key];
    return task.id ? candidate.id === task.id : key === task.name;
  });
  if (previousKey && previousKey !== taskKey) delete tasks[previousKey];
  return {
    ...project,
    tasks: {
      ...tasks,
      [taskKey]: task
    }
  };
}

