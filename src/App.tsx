import { useRef, useState } from 'react';
import { Workbench, ResultModal, SimulationResultBundle } from './presentation';
import { runTaskSimulation, createDefaultProject } from './usecases';
import { SimulationTask, Project } from './domain/entities';
import { defaultIpcAdapter } from './adapters';
import './App.css';

export function App() {
  const [project, setProject] = useState<Project>(() => createDefaultProject());
  const [activeBundle, setActiveBundle] = useState<SimulationResultBundle | null>(null);
  const [modalTab, setModalTab] = useState<'vis' | 'tab' | 'dat'>('vis');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [persistedBundles, setPersistedBundles] = useState<SimulationResultBundle[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const historyRequestId = useRef(0);

  const handleRunSimulation = async (task: SimulationTask) => {
    try {
      const taskEntry = Object.entries(project.tasks).find(([, candidate]) =>
        task.id
          ? candidate.id === task.id
          : candidate.name === task.name && candidate.cellId === task.cellId
      );
      if (!taskEntry) throw new Error(`Tugas "${task.name}" tidak ditemukan di proyek aktif.`);

      const [taskKey, projectTask] = taskEntry;
      const projectToSave: Project = {
        ...project,
        tasks: { ...project.tasks, [taskKey]: { ...projectTask, ...task } }
      };

      const runProject = projectToSave;
      setProject(runProject);

      const runTask = Object.values(runProject.tasks).find((candidate) =>
        task.id
          ? candidate.id === task.id
          : candidate.name === task.name && candidate.cellId === task.cellId
      ) || task;
      const cell =
        runProject.cells[runTask.cellName || ''] ||
        Object.values(runProject.cells).find((candidate) => candidate.id === runTask.cellId);

      if (!cell) throw new Error(`Sel untuk tugas "${runTask.name}" tidak ditemukan.`);

      const bundle = await runTaskSimulation(cell, runTask, runProject.drugs);
      setActiveBundle(bundle);
      setModalTab('vis');
      setIsModalOpen(true);

      const nextRuns = [bundle, ...persistedBundles];
      setPersistedBundles(nextRuns);
      if (projectFilePath) {
        const saved = await defaultIpcAdapter.saveProjectFile(runProject, nextRuns, projectFilePath);
        setProject(saved.project);
        setProjectFilePath(saved.path);
        setHistoryError('');
      } else {
        setHistoryError('Hasil tampil, tetapi project belum disimpan ke file.');
      }
    } catch (error) {
      console.error('Simulation execution failed:', error);
      setHistoryError(`Simulasi gagal: ${String(error)}`);
    }
  };

  const handleOpenResult = (bundle: SimulationResultBundle, tab: 'vis' | 'tab' | 'dat') => {
    setActiveBundle(bundle);
    setModalTab(tab);
    setIsModalOpen(true);
  };

  const handleSaveToBackend = async (proj: Project): Promise<Project> => {
    const saved = await defaultIpcAdapter.saveProjectFile(proj, persistedBundles, projectFilePath || undefined);
    setProjectFilePath(saved.path);
    return saved.project;
  };

  const handleLoadFromBackend = async (name: string): Promise<Project> => {
    return await defaultIpcAdapter.loadProject(name);
  };

  const handleOpenProjectFile = async (): Promise<Project> => {
    const loaded = await defaultIpcAdapter.loadProjectFile();
    setProjectFilePath(loaded.path);
    setPersistedBundles(loaded.simulationRuns);
    setHistoryError('');
    return loaded.project;
  };

  const handleUpdateProject = (updater: (previous: Project) => Project) => {
    setProject(updater);
  };

  const handleNewProject = () => {
    setProject(createDefaultProject());
    setProjectFilePath(null);
    setActiveBundle(null);
    setPersistedBundles([]);
    setHistoryError('');
    setIsModalOpen(false);
  };

  const handleDeleteSimulationRun = async (id: string) => {
    const deleted = await defaultIpcAdapter.deleteSimulationRun(id);
    if (!deleted) throw new Error('Riwayat tidak ditemukan di penyimpanan.');
    historyRequestId.current++;
    setPersistedBundles((previous) => previous.filter((bundle) => bundle.id !== id));
  };

  return (
    <>
      <Workbench
        project={project}
        onUpdateProject={handleUpdateProject}
        onNewProject={handleNewProject}
        onRunSimulation={handleRunSimulation}
        activeBundle={activeBundle}
        persistedBundles={persistedBundles}
        historyError={historyError}
        onDeleteSimulationRun={handleDeleteSimulationRun}
        onOpenResult={handleOpenResult}
        onSaveToBackend={handleSaveToBackend}
        onLoadFromBackend={handleLoadFromBackend}
        onOpenProjectFile={handleOpenProjectFile}
      />

      {isModalOpen && activeBundle && (
        <ResultModal
          bundle={activeBundle}
          initialTab={modalTab}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}

export default App;
