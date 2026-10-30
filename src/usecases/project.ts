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
      [defaultCell.name]: defaultCell
    },
    drugs: { ...DEFAULT_DRUGS },
    customFunctions: {},
    customUnits: {},
    tasks: {
      [defaultTask.name]: defaultTask
    }
  };
}

export function addOrUpdateCell(project: Project, cell: Cell): Project {
  return {
    ...project,
    cells: {
      ...project.cells,
      [cell.name]: cell
    }
  };
}

export function addOrUpdateDrug(project: Project, drug: Drug): Project {
  return {
    ...project,
    drugs: {
      ...project.drugs,
      [drug.key]: drug
    }
  };
}

export function addOrUpdateTask(project: Project, task: SimulationTask): Project {
  return {
    ...project,
    tasks: {
      ...project.tasks,
      [task.name]: task
    }
  };
}

