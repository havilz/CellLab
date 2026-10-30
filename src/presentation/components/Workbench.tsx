import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { Project, SimulationTask, Cell, Drug } from '../../domain/entities';
import { CATALOG, DEFAULT_REACTIONS } from '../../domain/constants';
import { defaultIpcAdapter, PythonEngineStatus } from '../../adapters';
import { SimulationResultBundle } from './CellCanvas';
import { addOrUpdateCell, addOrUpdateDrug, addOrUpdateTask } from '../../usecases/project';
import {
  DrugModal,
  CellModal,
  TaskModal,
  SaveProjectModal,
  OpenProjectModal
} from './Modals';

interface WorkbenchProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  onNewProject?: () => void;
  onRunSimulation?: (task: SimulationTask) => Promise<void>;
  activeBundle?: SimulationResultBundle | null;
  persistedBundles?: SimulationResultBundle[];
  historyError?: string;
  onDeleteSimulationRun?: (id: string) => Promise<void>;
  onOpenResult?: (bundle: SimulationResultBundle, tab: 'vis' | 'tab' | 'dat') => void;
  onSaveToBackend?: (project: Project) => Promise<Project>;
  hasProjectFile?: boolean;
  onLoadFromBackend?: (name: string) => Promise<Project>;
  onOpenProjectFile?: () => Promise<Project>;
}

const TREE_SECTIONS = [
  {
    group: 'Model',
    items: [
      { id: 'obat', icon: 'flask-2', label: 'Obat' },
      { id: 'zat', icon: 'atom', label: 'Zat' },
      { id: 'sel', icon: 'circle-dot', label: 'Sel' },
      { id: 'reaksi', icon: 'arrows-exchange', label: 'Reaksi' },
      { id: 'param', icon: 'adjustments', label: 'Parameter' }
    ]
  },
  {
    group: 'Tugas',
    items: [
      { id: 'sim', icon: 'play', label: 'Simulasi waktu' },
      { id: 'scan', icon: 'chart-dots', label: 'Pindai dosis', soon: true },
      { id: 'ss', icon: 'target', label: 'Steady-state', soon: true }
    ]
  },
  {
    group: 'Hasil',
    items: [
      { id: 'grafik', icon: 'chart-line', label: 'Grafik dan tabel' },
      { id: 'visual', icon: 'eye', label: 'Visual sel' }
    ]
  },
  {
    group: 'Fungsi',
    items: [{ id: 'fungsi', icon: 'math-function', label: 'Rumus laju' }]
  },
  {
    group: 'Satuan',
    items: [{ id: 'satuan', icon: 'ruler-2', label: 'Satuan' }]
  }
];

export const Workbench: React.FC<WorkbenchProps> = ({
  project,
  onUpdateProject,
  onNewProject,
  onRunSimulation,
  activeBundle,
  persistedBundles = [],
  historyError = '',
  onDeleteSimulationRun,
  onOpenResult,
  onSaveToBackend,
  hasProjectFile = false,
  onLoadFromBackend,
  onOpenProjectFile
}) => {
  const [node, setNode] = useState<string>('sim');
  const [selId, setSelId] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [status, setStatus] = useState<string>('Siap');
  const [simInfo, setSimInfo] = useState<string>('');
  const [engineStatus, setEngineStatus] = useState<PythonEngineStatus | null>(null);
  const [engineErr, setEngineErr] = useState<string>('');
  const [resultsList, setResultsList] = useState<SimulationResultBundle[]>([]);

  // Modals state
  const [drugModalOpen, setDrugModalOpen] = useState(false);
  const [editingDrug, setEditingDrug] = useState<Drug | null>(null);

  const [cellModalOpen, setCellModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<Cell | null>(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<SimulationTask | null>(null);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [savedProjectList, setSavedProjectList] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync selection when node changes
  useEffect(() => {
    const data = getTableData();
    if (data.rows.length > 0) {
      setSelId(data.rows[0].id);
    } else {
      setSelId('');
    }
  }, [node]);

  // Theme setup
  useEffect(() => {
    const savedTheme = localStorage.getItem('celllab.theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('celllab.theme', next);
    } catch {
      // ignore
    }
  };

  // Verify Python engine on mount
  const checkEngine = async () => {
    setEngineErr('');
    try {
      const res = await defaultIpcAdapter.verifyPythonEngine();
      setEngineStatus(res);
    } catch (err) {
      setEngineStatus(null);
      setEngineErr(String(err));
    }
  };

  useEffect(() => {
    void checkEngine();
  }, []);

  // Sync active result
  useEffect(() => {
    setResultsList(persistedBundles);
  }, [persistedBundles]);

  useEffect(() => {
    if (historyError) {
      setStatus(`Gagal memuat riwayat simulasi: ${historyError}`);
    } else {
      setStatus((current) =>
        current.startsWith('Gagal memuat riwayat simulasi:') ? 'Siap' : current
      );
    }
  }, [historyError]);

  useEffect(() => {
    if (activeBundle) {
      setResultsList((prev) => [
        activeBundle,
        ...prev.filter((bundle) =>
          activeBundle.id ? bundle.id !== activeBundle.id : bundle.ranAt !== activeBundle.ranAt
        )
      ]);
      setSimInfo(`${1 + activeBundle.exps.length} skenario · 300 s`);
    }
  }, [activeBundle]);

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Helper row getters
  const cells = Object.values(project.cells);
  const tasks = Object.values(project.tasks);
  const drugs = Object.values(project.drugs);

  // Rows and headers by node
  const getTableData = () => {
    switch (node) {
      case 'obat':
        return {
          title: 'Obat',
          headers: ['Nama', 'Rujukan', 'Target', 'Takaran acuan', 'Ki'],
          canNew: true,
          canEdit: true,
          canDelete: true,
          rows: drugs.map((d) => ({
            id: d.id || d.key,
            data: d,
            cols: [
              d.name,
              d.ref || '-',
              CATALOG[d.target]?.name || d.target,
              `${d.refConc.toFixed(3)} mM`,
              `${d.ki.toFixed(3)} mM`
            ]
          }))
        };
      case 'zat':
        return {
          title: 'Zat',
          headers: ['Nama', 'Rujukan', 'Jenis', 'Kompartemen', 'Bawaan'],
          canNew: false,
          canEdit: false,
          canDelete: false,
          rows: Object.values(CATALOG).map((z) => ({
            id: z.key,
            data: z,
            cols: [z.name, z.ref, z.cat, z.comp, `${z.def} mM`]
          }))
        };
      case 'sel':
        return {
          title: 'Sel',
          headers: ['Nama', 'Jumlah zat', 'Dipakai tugas'],
          canNew: true,
          canEdit: true,
          canDelete: true,
          rows: cells.map((c) => ({
            id: c.id,
            data: c,
            cols: [
              c.name,
              `${c.items.length} zat`,
              `${tasks.filter((t) => t.cellId === c.id).length} tugas`
            ]
          }))
        };
      case 'reaksi':
        return {
          title: 'Reaksi',
          headers: ['ID', 'Nama', 'Persamaan'],
          canNew: false,
          canEdit: false,
          canDelete: false,
          rows: DEFAULT_REACTIONS.map((r) => ({
            id: r.id,
            data: r,
            cols: [r.id, r.name, r.eq]
          }))
        };
      case 'param':
        return {
          title: 'Parameter',
          headers: ['Nama', 'Nilai', 'Catatan'],
          canNew: false,
          canEdit: false,
          canDelete: false,
          rows: [
            { id: '1', data: null, cols: ['Durasi simulasi', '300 s', 'Sama untuk semua tugas'] },
            { id: '2', data: null, cols: ['Peluruhan obat bolus', '0,010 /s', 't½ sekitar 69 s'] },
            { id: '3', data: null, cols: ['ADP awal', '0,8 mM', 'Bila ATP ada di sel'] },
            { id: '4', data: null, cols: ['Pasokan asam arakidonat', '0,025 mM/s', 'Selama zat ini ada di sel'] }
          ]
        };
      case 'sim':
        return {
          title: 'Simulasi waktu',
          headers: ['Nama', 'Sel', 'Obat', 'Dosis'],
          canNew: true,
          canEdit: true,
          canDelete: true,
          rows: tasks.map((t) => ({
            id: t.id || t.name,
            data: t,
            cols: [
              t.name,
              cells.find((c) => c.id === t.cellId)?.name || '-',
              `${t.doses.length} obat`,
              t.doses.map((d) => `${d.pct}%`).join(', ') || 'Kontrol'
            ]
          }))
        };
      case 'grafik':
      case 'visual':
        return {
          title: node === 'grafik' ? 'Grafik dan tabel' : 'Visual sel',
          headers: ['Tugas', 'Sel', 'Skenario', 'Waktu'],
          canNew: false,
          canEdit: false,
          canDelete: true,
          rows: resultsList.map((r) => ({
            id: r.id || String(r.ranAt),
            data: r,
            cols: [
              r.title,
              r.cellName,
              `${1 + r.exps.length}`,
              new Date(r.ranAt).toLocaleTimeString('id-ID')
            ]
          }))
        };
      case 'fungsi':
        return {
          title: 'Rumus laju',
          headers: ['Nama', 'Rumus', 'Dipakai di'],
          canNew: false,
          canEdit: false,
          canDelete: false,
          rows: [
            { id: 'f1', data: null, cols: ['Transpor', '0,05 · (GLUT1 / 0,01) · (medium − dalam sel)', 'R1'] },
            { id: 'f2', data: null, cols: ['Michaelis-Menten', 'Vmax · E · S / (Km + S)', 'R2, R6'] },
            { id: 'f3', data: null, cols: ['Inhibisi non-kompetitif', 'laju × 1 / (1 + I / Ki)', 'Obat'] },
            { id: 'f4', data: null, cols: ['Peluruhan sekali beri', 'I(t) = I0 · e^(−0,01 · (t − t0))', 'Mode bolus'] },
            { id: 'f5', data: null, cols: ['Orde satu', 'k · S', 'R4, R7'] }
          ]
        };
      case 'satuan':
        return {
          title: 'Satuan',
          headers: ['Besaran', 'Satuan', 'Catatan'],
          canNew: false,
          canEdit: false,
          canDelete: false,
          rows: [
            { id: 'u1', data: null, cols: ['Konsentrasi', 'mM', 'milimolar'] },
            { id: 'u2', data: null, cols: ['Waktu', 's', 'detik'] },
            { id: 'u3', data: null, cols: ['Volume sel', 'pL', 'sitoplasma 1 pL'] },
            { id: 'u4', data: null, cols: ['Dosis', 'mg', 'Konversi mg ke mM butuh model farmakokinetik'] }
          ]
        };
      default:
        return { title: 'Daftar', headers: [], canNew: false, canEdit: false, canDelete: false, rows: [] };
    }
  };

  const tableData = getTableData();

  // Add / Edit / Delete handlers
  const handleNew = () => {
    if (node === 'obat') {
      setEditingDrug(null);
      setDrugModalOpen(true);
    } else if (node === 'sel') {
      setEditingCell(null);
      setCellModalOpen(true);
    } else if (node === 'sim') {
      setEditingTask(null);
      setTaskModalOpen(true);
    }
  };

  const handleEdit = () => {
    if (node === 'obat') {
      const d = drugs.find((x) => (x.id || x.key) === selId);
      if (d) {
        setEditingDrug(d);
        setDrugModalOpen(true);
      }
    } else if (node === 'sel') {
      const c = cells.find((x) => x.id === selId);
      if (c) {
        setEditingCell(c);
        setCellModalOpen(true);
      }
    } else if (node === 'sim') {
      const t = tasks.find((x) => (x.id || x.name) === selId);
      if (t) {
        setEditingTask(t);
        setTaskModalOpen(true);
      }
    }
  };

  const handleDelete = async () => {
    if (node === 'obat') {
      if (!confirm('Hapus obat ini?')) return;
      onUpdateProject((prev) => {
        const nextDrugs = { ...prev.drugs };
        const selectedDrug = drugs.find((drug) => (drug.id || drug.key) === selId);
        if (selectedDrug) delete nextDrugs[selectedDrug.key];
        return { ...prev, drugs: nextDrugs };
      });
      setStatus('Obat dihapus');
    } else if (node === 'sel') {
      if (tasks.some((t) => t.cellId === selId)) {
        setStatus('Gagal menghapus: Sel masih dipakai oleh tugas simulasi.');
        return;
      }
      if (!confirm('Hapus profil sel ini?')) return;
      onUpdateProject((prev) => {
        const nextCells = Object.fromEntries(
          Object.entries(prev.cells).filter(([, c]) => c.id !== selId)
        );
        return { ...prev, cells: nextCells };
      });
      setStatus('Sel dihapus');
    } else if (node === 'sim') {
      if (!confirm('Hapus tugas simulasi ini?')) return;
      onUpdateProject((prev) => {
        const nextTasks = Object.fromEntries(
          Object.entries(prev.tasks).filter(([k, t]) => (t.id || k) !== selId)
        );
        return { ...prev, tasks: nextTasks };
      });
      setStatus('Tugas dihapus');
    } else if (node === 'grafik' || node === 'visual') {
      const selectedBundle = resultsList.find((bundle) => (bundle.id || String(bundle.ranAt)) === selId);
      if (!selectedBundle) return;
      try {
        if (selectedBundle.id) {
          if (onDeleteSimulationRun) {
            await onDeleteSimulationRun(selectedBundle.id);
          } else {
            const deleted = await defaultIpcAdapter.deleteSimulationRun(selectedBundle.id);
            if (!deleted) throw new Error('Riwayat tidak ditemukan di penyimpanan.');
          }
        }
        setResultsList((previous) => previous.filter((bundle) => bundle !== selectedBundle));
        setStatus('Riwayat hasil simulasi dihapus');
      } catch (err) {
        setStatus(`Gagal menghapus riwayat: ${err}`);
      }
    }
  };

  // Run simulation
  const handleRunTask = async () => {
    if (node === 'sim') {
      const task = tasks.find((t) => (t.id || t.name) === selId) || tasks[0];
      if (task && onRunSimulation) {
        setStatus(`Menjalankan simulasi: ${task.name}...`);
        try {
          await onRunSimulation(task);
          setStatus(`Simulasi "${task.name}" selesai dan tersimpan.`);
        } catch (err) {
          setStatus(`Gagal menjalankan atau menyimpan simulasi: ${err}`);
        }
      }
    } else {
      setNode('sim');
      setStatus('Pilih tugas simulasi lalu tekan Jalankan.');
    }
  };

  // Save / Load / Export / Import handlers
  const handleOpenSaveDialog = () => {
    if (hasProjectFile && onSaveToBackend) {
      void handleSaveCurrentProject();
      return;
    }
    setSaveModalOpen(true);
  };

  const handleNewProject = () => {
    onNewProject?.();
    setSaveModalOpen(true);
    setStatus('Proyek baru dibuat. Beri nama lalu simpan.');
  };

  const handleSaveProject = async (name: string) => {
    const updated: Project = { ...project, name };
    onUpdateProject(() => updated);
    setStatus(`Menyimpan proyek "${name}"...`);
    if (onSaveToBackend) {
      try {
        const saved = await onSaveToBackend(updated);
        onUpdateProject(() => saved);
        setStatus(`Proyek "${name}" berhasil disimpan ke file project.`);
      } catch (err) {
        setStatus(`Gagal menyimpan: ${err}`);
      }
    } else {
      setStatus(`Proyek "${name}" disimpan lokal.`);
    }
  };

  const handleSaveCurrentProject = async () => {
    if (!onSaveToBackend) return;
    setStatus(`Menyimpan pembaruan proyek "${project.name}"...`);
    try {
      const saved = await onSaveToBackend(project);
      onUpdateProject(() => saved);
      setStatus(`Pembaruan proyek "${saved.name}" berhasil disimpan.`);
    } catch (err) {
      setStatus(`Gagal menyimpan pembaruan: ${err}`);
    }
  };

  const handleOpenLoadDialog = async () => {
    if (onOpenProjectFile) {
      try {
        const loaded = await onOpenProjectFile();
        onUpdateProject(() => loaded);
        setStatus(`Proyek "${loaded.name}" berhasil dibuka dari folder project.`);
      } catch (err) {
        setStatus(`Gagal membuka file project: ${err}`);
      }
      return;
    }
    try {
      const list = await defaultIpcAdapter.listProjects();
      setSavedProjectList(list);
      setOpenModalOpen(true);
    } catch (err) {
      setStatus(`Gagal membaca daftar proyek: ${err}`);
    }
  };

  const handleLoadProject = async (name: string) => {
    if (onLoadFromBackend) {
      try {
        const loaded = await onLoadFromBackend(name);
        onUpdateProject(() => loaded);
        setStatus(`Proyek "${name}" berhasil dibuka.`);
      } catch (err) {
        setStatus(`Gagal membuka proyek: ${err}`);
      }
    }
  };

  const handleDeleteProject = async (name: string) => {
    if (!window.confirm(`Hapus proyek "${name}" beserta seluruh riwayat simulasinya?`)) return;
    try {
      const deleted = await defaultIpcAdapter.deleteProject(name);
      if (!deleted) {
        setStatus(`Proyek "${name}" tidak ditemukan.`);
        return;
      }
      setSavedProjectList((previous) => previous.filter((projectName) => projectName !== name));
      setStatus(`Proyek "${name}" dan riwayat simulasinya dihapus.`);
    } catch (err) {
      setStatus(`Gagal menghapus proyek: ${err}`);
    }
  };

  const handleExport = async () => {
    try {
      if (!onSaveToBackend) throw new Error('Project file adapter tidak tersedia.');
      await onSaveToBackend(project);
      setStatus('Project dan hasil simulasi disimpan ke folder project.');
    } catch (err) {
      setStatus(`Gagal mengekspor proyek: ${err}`);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileJson = String(event.target?.result ?? '');
        const parsed = JSON.parse(fileJson);
        const omittedResults = Array.isArray(parsed?.results) ? parsed.results.length : 0;
        const imported = await defaultIpcAdapter.importProject(fileJson);
        onUpdateProject(() => imported);
        setStatus(omittedResults
          ? `Proyek "${imported.name || file.name}" diimpor; ${omittedResults} hasil historis dari file tidak dapat dipulihkan.`
          : `Proyek "${imported.name || file.name}" berhasil diimpor.`);
      } catch (err) {
        setStatus(`Gagal mengimpor proyek: ${err}`);
      }
    };
    reader.onerror = () => setStatus(`Gagal membaca file proyek "${file.name}".`);
    reader.readAsText(file);
    e.target.value = '';
  };

  // Detail panel renderer
  const renderDetail = () => {
    if (node === 'obat') {
      const d = drugs.find((x) => (x.id || x.key) === selId) || drugs[0];
      if (!d) return <p className="muted">Pilih obat untuk melihat detail.</p>;
      return (
        <div className="dpad dblock">
          <h3>{d.name}</h3>
          <div className="muted">{d.ref || '-'}</div>
          <div className="kv"><span className="muted">Target</span><span>{CATALOG[d.target]?.name || d.target}</span></div>
          <div className="kv"><span className="muted">Takaran acuan</span><span>{d.refConc.toFixed(3)} mM</span></div>
          <div className="kv"><span className="muted">Ki</span><span>{d.ki.toFixed(3)} mM</span></div>
          <div className="kv"><span className="muted">Mekanisme</span><span>Inhibisi non-kompetitif</span></div>
          <div className="dblock" style={{ marginTop: '12px' }}>
            <button className="btn" onClick={handleEdit}>Edit Obat</button>
            <button className="btn danger" onClick={handleDelete}>Hapus</button>
          </div>
          <p className="note">Nilai ilustratif untuk kinetika komputasi dan edukasi.</p>
        </div>
      );
    }
    if (node === 'zat') {
      const z = CATALOG[selId] || Object.values(CATALOG)[0];
      if (!z) return <p className="muted">Pilih zat untuk melihat detail.</p>;
      return (
        <div className="dpad dblock">
          <h3>{z.name}</h3>
          <div className="muted">{z.ref} · {z.cat}</div>
          <div className="kv"><span className="muted">Kompartemen</span><span>{z.comp}</span></div>
          <div className="kv"><span className="muted">Bawaan</span><span>{z.def} mM</span></div>
          <div className="kv"><span className="muted">Rentang</span><span>{z.min} – {z.max} mM</span></div>
          <p className="note">{z.hint}</p>
        </div>
      );
    }
    if (node === 'sel') {
      const c = cells.find((x) => x.id === selId) || cells[0];
      if (!c) return <p className="muted">Pilih sel untuk melihat detail.</p>;
      return (
        <div className="dpad dblock">
          <h3>{c.name}</h3>
          <div className="kv"><span className="muted">Jumlah zat</span><span>{c.items.length}</span></div>
          <div className="lbl" style={{ marginTop: '10px' }}>Komposisi Zat</div>
          <div className="comp">
            <div className="comp-h"><span>Sitoplasma</span></div>
            <div className="comp-b">
              {c.items.map((i) => (
                <span key={i.key} className="chip">
                  <span className={`dot c-${CATALOG[i.key]?.cat || 'metabolit'}`} />
                  <b>{CATALOG[i.key]?.name || i.key}</b>
                  <span className="val">{i.conc} mM</span>
                </span>
              ))}
            </div>
          </div>
          <div className="dblock" style={{ marginTop: '12px' }}>
            <button className="btn" onClick={handleEdit}>Edit Sel</button>
            <button className="btn danger" onClick={handleDelete}>Hapus</button>
          </div>
        </div>
      );
    }
    if (node === 'sim') {
      const t = tasks.find((x) => (x.id || x.name) === selId) || tasks[0];
      if (!t) return <p className="muted">Pilih tugas untuk melihat detail.</p>;
      const cell = cells.find((c) => c.id === t.cellId) || cells[0];
      return (
        <div className="dpad dblock">
          <h3>{t.name}</h3>
          <div className="muted">Simulasi waktu · 300 s</div>
          <div className="kv"><span className="muted">Sel acuan</span><span>{cell?.name || '-'}</span></div>
          <div className="lbl" style={{ marginTop: '12px' }}>Dosis Obat</div>
          {t.doses.length === 0 ? (
            <p className="hint">Tanpa obat (kontrol murni)</p>
          ) : (
            t.doses.map((d, i) => (
              <div key={i} className="rx">
                <span>{Object.values(project.drugs).find((drug) => (drug.id || `drug-${drug.key}`) === d.drugId)?.name || d.drugId} {d.pct}% @ {d.t0} s ({d.mode})</span>
              </div>
            ))
          )}
          <button className="btn primary" style={{ marginTop: '12px', width: '100%' }} onClick={handleRunTask}>
            Jalankan Tugas Ini
          </button>
          <div className="dblock" style={{ marginTop: '8px' }}>
            <button className="btn" onClick={handleEdit}>Edit Tugas</button>
            <button className="btn danger" onClick={handleDelete}>Hapus</button>
          </div>
        </div>
      );
    }
    if (node === 'grafik' || node === 'visual') {
      const r = resultsList.find((x) => (x.id || String(x.ranAt)) === selId) || resultsList[0];
      if (!r) return <p className="muted">Belum ada hasil simulasi yang dipilih.</p>;
      return (
        <div className="dpad dblock">
          <h3>{r.title}</h3>
          <div className="muted">{r.cellName} · {new Date(r.ranAt).toLocaleString('id-ID')}</div>
          <div className="kv"><span className="muted">Skenario</span><span>{1 + r.exps.length}</span></div>
          <div className="dblock" style={{ marginTop: '12px' }}>
            <button className="btn primary" onClick={() => onOpenResult && onOpenResult(r, 'vis')}>
              Buka Visual Sel
            </button>
            <button className="btn" onClick={() => onOpenResult && onOpenResult(r, 'dat')}>
              Buka Grafik
            </button>
            <button className="btn" onClick={() => onOpenResult && onOpenResult(r, 'tab')}>
              Buka Tabel
            </button>
            <button className="btn danger" style={{ marginTop: '8px' }} onClick={handleDelete}>
              Hapus Riwayat
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="dpad dblock">
        <h3>{tableData.title}</h3>
        <p className="muted">Pilih salah satu item di daftar untuk melihat detail lengkap.</p>
      </div>
    );
  };

  return (
    <div className="app">
      {/* Titlebar */}
      <header className="titlebar">
        <span className="logo"><Icon name="microscope" size={18} /></span>
        <strong>CellLab</strong>
        <span className="sep">/</span>
        <span className="doc" title={hasProjectFile ? 'Nama project diubah melalui File Explorer' : 'Project belum disimpan'}>{project.name}</span>
        <span className="grow" />
        <span className="proto">Prototipe Desktop Ilmiah · Parameter Ilustratif</span>
      </header>

      {/* Toolbar */}
      <nav className="toolbar" aria-label="Toolbar">
        <button className="tb" onClick={handleNewProject}>
          <Icon name="file-plus" size={16} />
          <span>Baru</span>
        </button>
        <button className="tb" onClick={handleOpenLoadDialog}>
          <Icon name="folder-open" size={16} />
          <span>Buka</span>
        </button>
        <button className="tb" onClick={handleOpenSaveDialog}>
          <Icon name="save" size={16} />
          <span>Simpan</span>
        </button>
        <button className="tb" onClick={handleExport}>
          <Icon name="download" size={16} />
          <span>Ekspor</span>
        </button>
        <button className="tb" onClick={handleOpenLoadDialog}>
          <Icon name="upload" size={16} />
          <span>Impor</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <span className="vsep" />
        <button className="tb primary" onClick={handleRunTask}>
          <Icon name="play" size={16} />
          <span>Jalankan</span>
        </button>
        <span className="grow" />
        <button className="tb icon" onClick={toggleTheme} title="Ganti Tema">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </nav>

      {/* Workspace */}
      <div className="workspace">
        {/* Left Tree Panel */}
        <aside className="panel" id="tree" aria-label="Pohon Model">
          {TREE_SECTIONS.map((sec) => {
            const isOpen = !collapsed[sec.group];
            return (
              <div key={sec.group} className="grp">
                <button className="grp-h" onClick={() => toggleGroup(sec.group)}>
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
                  <span>{sec.group}</span>
                </button>
                {isOpen &&
                  sec.items.map((item) => (
                    <button
                      key={item.id}
                      className={`tn ${node === item.id ? 'sel' : ''}`}
                      onClick={() => setNode(item.id)}
                    >
                      <Icon name={item.icon} size={15} />
                      <span>{item.label}</span>
                      {item.soon && <span className="soon">segera</span>}
                    </button>
                  ))}
              </div>
            );
          })}
        </aside>

        {/* Center Main View */}
        <main className="center" id="view">
          <div className="cv-h">
            <h2>{tableData.title}</h2>
            {tableData.canNew && (
              <button className="tb" onClick={handleNew}>
                <Icon name="plus" size={14} />
                <span>Baru</span>
              </button>
            )}
            {tableData.canEdit && selId && (
              <button className="tb" onClick={handleEdit}>
                <Icon name="pencil" size={14} />
                <span>Edit</span>
              </button>
            )}
            {tableData.canDelete && selId && (
              <button className="tb" onClick={handleDelete}>
                <Icon name="trash" size={14} />
                <span>Hapus</span>
              </button>
            )}
            {node === 'sim' && (
              <button className="tb primary" onClick={handleRunTask}>
                <Icon name="play" size={14} />
                <span>Jalankan</span>
              </button>
            )}
            {(node === 'grafik' || node === 'visual') && selId && (
              <button
                className="tb primary"
                onClick={() => {
                  const r = resultsList.find((x) => (x.id || String(x.ranAt)) === selId) || resultsList[0];
                  if (r && onOpenResult) onOpenResult(r, node === 'grafik' ? 'dat' : 'vis');
                }}
              >
                <Icon name="folder-open" size={14} />
                <span>Buka Hasil</span>
              </button>
            )}
          </div>
          <div className="cv-b">
            {tableData.rows.length === 0 ? (
              <p className="empty">Belum ada data untuk ditampilkan pada kategori ini.</p>
            ) : (
              <table className="tbl list">
                <thead>
                  <tr>
                    {tableData.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selId === row.id ? 'sel' : ''}
                      onClick={() => setSelId(row.id)}
                      onDoubleClick={() => {
                        if (node === 'sim') handleRunTask();
                        else if (node === 'grafik' || node === 'visual') {
                          const r = resultsList.find((x) => (x.id || String(x.ranAt)) === row.id) || resultsList[0];
                          if (r && onOpenResult) onOpenResult(r, node === 'grafik' ? 'dat' : 'vis');
                        } else if (tableData.canEdit) handleEdit();
                      }}
                    >
                      {row.cols.map((col, ci) => (
                        <td key={ci}>{col}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* Right Detail Panel */}
        <aside className="panel" id="detail" aria-label="Detail">
          {renderDetail()}
        </aside>
      </div>

      {/* Status Bar */}
      <footer className="statusbar">
        <span>{status}</span>
        <span className="grow" />
        {simInfo && <span className="muted">{simInfo} · </span>}
        {engineStatus ? (
          <span className="engine-badge ok" title={`Python ${engineStatus.python_version}`}>
            ● Engine Python: Aktif ({engineStatus.engine})
          </span>
        ) : engineErr ? (
          <span className="engine-badge err" title={engineErr}>
            ▲ Engine Python: Terputus
          </span>
        ) : (
          <span className="engine-badge warn">
            ◌ Memeriksa Engine Python...
          </span>
        )}
      </footer>

      {/* Dialog Modals */}
      <DrugModal
        isOpen={drugModalOpen}
        initialDrug={editingDrug}
        onClose={() => setDrugModalOpen(false)}
        onSave={(drug) => {
          onUpdateProject((prev) => addOrUpdateDrug(prev, drug));
          setStatus(`Obat "${drug.name}" disimpan.`);
        }}
      />

      <CellModal
        isOpen={cellModalOpen}
        initialCell={editingCell}
        onClose={() => setCellModalOpen(false)}
        onSave={(cell) => {
          onUpdateProject((prev) => addOrUpdateCell(prev, cell));
          setStatus(`Sel "${cell.name}" disimpan.`);
        }}
      />

      <TaskModal
        isOpen={taskModalOpen}
        initialTask={editingTask}
        cells={cells}
        drugs={project.drugs}
        onClose={() => setTaskModalOpen(false)}
        onSave={(task) => {
          onUpdateProject((prev) => addOrUpdateTask(prev, task));
          setStatus(`Tugas "${task.name}" disimpan.`);
        }}
      />

      <SaveProjectModal
        isOpen={saveModalOpen}
        currentName={project.name}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveProject}
      />

      <OpenProjectModal
        isOpen={openModalOpen}
        projects={savedProjectList}
        onClose={() => setOpenModalOpen(false)}
        onOpenProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
      />
    </div>
  );
};
