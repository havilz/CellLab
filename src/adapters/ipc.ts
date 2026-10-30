import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Project,
  Cell,
  Drug,
  SimulationTask,
  SimulationResult,
  StoredSimulationResult,
  SimulationResultBundle,
  StoredSimulationRun
} from '../domain/entities';

export interface SimulationRequest {
  cell: Cell;
  task: SimulationTask;
  drugs: Record<string, Drug>;
}

export interface PythonEngineStatus {
  status: string;
  engine: string;
  python_version: string;
}

export interface IpcBridge {
  verifyPythonEngine(): Promise<PythonEngineStatus>;
  runSimulation(request: SimulationRequest): Promise<SimulationResult>;
  saveProject(project: Project): Promise<Project>;
  loadProject(name: string): Promise<Project>;
  listProjects(): Promise<string[]>;
  deleteProject(name: string): Promise<boolean>;
  importProject(fileJson: string): Promise<Project>;
  exportProject(project: Project): Promise<string>;
  listSimulationResults(taskId: string): Promise<StoredSimulationResult[]>;
  saveSimulationRun(taskId: string, bundle: SimulationResultBundle): Promise<StoredSimulationRun>;
  listSimulationRuns(taskId: string): Promise<StoredSimulationRun[]>;
  deleteSimulationRun(id: string): Promise<boolean>;
  saveProjectFile(project: Project, simulationRuns: SimulationResultBundle[], path?: string): Promise<{ project: Project; path: string }>;
  loadProjectFile(): Promise<{ project: Project; simulationRuns: SimulationResultBundle[]; path: string }>;
}

export class TauriIpcAdapter implements IpcBridge {
  async verifyPythonEngine(): Promise<PythonEngineStatus> {
    return await invoke<PythonEngineStatus>('verify_python_engine');
  }

  async runSimulation(request: SimulationRequest): Promise<SimulationResult> {
    return await invoke<SimulationResult>('run_simulation', { request });
  }

  async saveProject(project: Project): Promise<Project> {
    return await invoke<Project>('save_project', { project });
  }

  async loadProject(name: string): Promise<Project> {
    return await invoke<Project>('load_project', { name });
  }

  async listProjects(): Promise<string[]> {
    return await invoke<string[]>('list_projects');
  }

  async deleteProject(name: string): Promise<boolean> {
    return await invoke<boolean>('delete_project', { name });
  }

  async importProject(fileJson: string): Promise<Project> {
    return await invoke<Project>('import_project', { fileJson });
  }

  async exportProject(project: Project): Promise<string> {
    return await invoke<string>('export_project', { project });
  }

  async listSimulationResults(taskId: string): Promise<StoredSimulationResult[]> {
    return await invoke<StoredSimulationResult[]>('list_simulation_results', { taskId });
  }

  async saveSimulationRun(
    taskId: string,
    bundle: SimulationResultBundle
  ): Promise<StoredSimulationRun> {
    return await invoke<StoredSimulationRun>('save_simulation_run', { taskId, bundle });
  }

  async listSimulationRuns(taskId: string): Promise<StoredSimulationRun[]> {
    return await invoke<StoredSimulationRun[]>('list_simulation_runs', { taskId });
  }

  async deleteSimulationRun(id: string): Promise<boolean> {
    return await invoke<boolean>('delete_simulation_run', { id });
  }

  async saveProjectFile(
    project: Project,
    simulationRuns: SimulationResultBundle[],
    path?: string
  ): Promise<{ project: Project; path: string }> {
    const selectedPath = path || await open({ directory: true, multiple: false });
    if (!selectedPath || Array.isArray(selectedPath)) throw new Error('Penyimpanan project dibatalkan.');
    const saved = await invoke<{ project: Project; path: string }>('save_project_file', {
      path: selectedPath,
      project,
      simulationRuns
    });
    return saved;
  }

  async loadProjectFile(): Promise<{ project: Project; simulationRuns: SimulationResultBundle[]; path: string }> {
    const selectedPath = await open({
      directory: true,
      multiple: false,
    });
    if (!selectedPath || Array.isArray(selectedPath)) throw new Error('Pembukaan project dibatalkan.');
    const envelope = await invoke<{
      project: Project;
      simulationRuns?: SimulationResultBundle[];
    }>('load_project_file', { path: selectedPath });
    return { project: envelope.project, simulationRuns: envelope.simulationRuns || [], path: selectedPath };
  }
}

export const defaultIpcAdapter = new TauriIpcAdapter();
