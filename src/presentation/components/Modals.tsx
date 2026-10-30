import React, { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { Cell, Drug, SimulationTask, DrugDose } from '../../domain/entities';
import { CATALOG, DEFAULT_DRUGS } from '../../domain/constants';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ----------------- DRUG MODAL -----------------
interface DrugModalProps extends ModalProps {
  initialDrug?: Drug | null;
  onSave: (drug: Drug) => void;
}

export const DrugModal: React.FC<DrugModalProps> = ({ isOpen, onClose, initialDrug, onSave }) => {
  const [name, setName] = useState(initialDrug?.name || '');
  const [ref, setRef] = useState(initialDrug?.ref || '');
  const [target, setTarget] = useState<'cox' | 'hk'>((initialDrug?.target as 'cox' | 'hk') || 'cox');
  const [refConc, setRefConc] = useState<number>(initialDrug?.refConc ?? 0.1);
  const [ki, setKi] = useState<number>(initialDrug?.ki ?? 0.1);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialDrug?.name || '');
    setRef(initialDrug?.ref || '');
    setTarget((initialDrug?.target as 'cox' | 'hk') || 'cox');
    setRefConc(initialDrug?.refConc ?? 0.1);
    setKi(initialDrug?.ki ?? 0.1);
  }, [initialDrug, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = initialDrug?.key || name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    onSave({
      id: initialDrug?.id || `drug-${Date.now().toString(36)}`,
      key,
      name: name.trim() || 'Obat Baru',
      ref: ref.trim(),
      target,
      refConc: Math.max(0.001, Number(refConc) || 0.1),
      ki: Math.max(0.001, Number(ki) || 0.1)
    });
    onClose();
  };

  return (
    <dialog open>
      <form onSubmit={handleSubmit}>
        <h2>{initialDrug ? 'Edit Obat' : 'Obat Baru'}</h2>
        <label>
          Nama obat
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            autoFocus
          />
        </label>
        <label>
          Rujukan (ChEBI, PubChem)
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            maxLength={30}
            placeholder="ChEBI:46195"
          />
        </label>
        <label>
          Target
          <select value={target} onChange={(e) => setTarget(e.target.value as 'cox' | 'hk')}>
            <option value="cox">COX-2</option>
            <option value="hk">Heksokinase</option>
          </select>
        </label>
        <label>
          Takaran acuan 100% (mM)
          <input
            type="number"
            min="0.001"
            step="any"
            value={refConc}
            onChange={(e) => setRefConc(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Ki, inhibisi non-kompetitif (mM)
          <input
            type="number"
            min="0.001"
            step="any"
            value={ki}
            onChange={(e) => setKi(Number(e.target.value))}
            required
          />
        </label>
        <p className="note">Nilai ilustratif untuk kinetika komputasi dan edukasi.</p>
        <div className="dlg-f">
          <button type="submit" className="btn primary">Simpan</button>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
        </div>
      </form>
    </dialog>
  );
};

// ----------------- CELL MODAL -----------------
interface CellModalProps extends ModalProps {
  initialCell?: Cell | null;
  onSave: (cell: Cell) => void;
}

export const CellModal: React.FC<CellModalProps> = ({ isOpen, onClose, initialCell, onSave }) => {
  const [name, setName] = useState(initialCell?.name || 'Sel Baru');
  const [items, setItems] = useState<Record<string, { enabled: boolean; conc: number }>>(() => {
    const init: Record<string, { enabled: boolean; conc: number }> = {};
    Object.values(CATALOG).forEach((cat) => {
      const existing = initialCell?.items.find((i) => i.key === cat.key);
      init[cat.key] = {
        enabled: !!existing,
        conc: existing ? existing.conc : cat.def
      };
    });
    return init;
  });

  useEffect(() => {
    if (!isOpen) return;
    const nextItems: Record<string, { enabled: boolean; conc: number }> = {};
    Object.values(CATALOG).forEach((cat) => {
      const existing = initialCell?.items.find((item) => item.key === cat.key);
      nextItems[cat.key] = {
        enabled: !!existing,
        conc: existing ? existing.conc : cat.def
      };
    });
    setName(initialCell?.name || 'Sel Baru');
    setItems(nextItems);
  }, [initialCell, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cellItems = Object.entries(items)
      .filter(([, val]) => val.enabled)
      .map(([key, val]) => ({ key, conc: val.conc }));

    onSave({
      id: initialCell?.id || `cell-${Date.now().toString(36)}`,
      name: name.trim() || 'Sel Baru',
      items: cellItems
    });
    onClose();
  };

  return (
    <dialog open style={{ width: 'min(520px, 94vw)' }}>
      <form onSubmit={handleSubmit}>
        <h2>{initialCell ? 'Edit Sel' : 'Sel Baru'}</h2>
        <label>
          Nama sel
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            autoFocus
          />
        </label>
        <p className="muted" style={{ margin: '8px 0' }}>
          Centang zat yang aktif pada sel dan atur konsentrasi awalnya:
        </p>
        <div className="saved-list">
          {Object.values(CATALOG).map((cat) => {
            const current = items[cat.key] || { enabled: false, conc: cat.def };
            return (
              <div key={cat.key} className="zrow">
                <label>
                  <input
                    type="checkbox"
                    checked={current.enabled}
                    onChange={(e) =>
                      setItems((prev) => ({
                        ...prev,
                        [cat.key]: { ...current, enabled: e.target.checked }
                      }))
                    }
                  />
                  <span className={`dot c-${cat.cat}`} />
                  {cat.name}
                  <span className="muted">({cat.comp})</span>
                </label>
                <input
                  type="number"
                  min={cat.min}
                  max={cat.max}
                  step={cat.step}
                  value={current.conc}
                  disabled={!current.enabled}
                  onChange={(e) =>
                    setItems((prev) => ({
                      ...prev,
                      [cat.key]: { ...current, conc: Number(e.target.value) }
                    }))
                  }
                />
                <span className="muted">mM</span>
              </div>
            );
          })}
        </div>
        <div className="dlg-f">
          <button type="submit" className="btn primary">Simpan</button>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
        </div>
      </form>
    </dialog>
  );
};

// ----------------- TASK MODAL -----------------
interface TaskModalProps extends ModalProps {
  initialTask?: SimulationTask | null;
  cells: Cell[];
  drugs: Record<string, Drug>;
  onSave: (task: SimulationTask) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  initialTask,
  cells,
  drugs,
  onSave
}) => {
  const [name, setName] = useState(initialTask?.name || 'Tugas Baru');
  const [cellId, setCellId] = useState<string>(initialTask?.cellId || cells[0]?.id || '');
  const [doses, setDoses] = useState<DrugDose[]>(() => initialTask?.doses.map((d) => ({ ...d })) || []);

  // Form row to add dose
  const drugIds = Object.values(drugs).map((drug) => drug.id || `drug-${drug.key}`);
  const [addDrugId, setAddDrugId] = useState<string>(drugIds[0] || 'drug-parasetamol');
  const [addPct, setAddPct] = useState<number>(100);
  const [addT0, setAddT0] = useState<number>(60);
  const [addMode, setAddMode] = useState<'konstan' | 'bolus'>('konstan');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialTask?.name || 'Tugas Baru');
    setCellId(initialTask?.cellId || cells[0]?.id || '');
    setDoses(initialTask?.doses.map((dose) => ({ ...dose })) || []);
    setAddDrugId(Object.values(drugs)[0]?.id || (Object.values(drugs)[0] ? `drug-${Object.values(drugs)[0].key}` : 'drug-parasetamol'));
  }, [initialTask, isOpen]);

  if (!isOpen) return null;

  const handleAddDose = () => {
    if (doses.length >= 4) return;
    setDoses((prev) => [
      ...prev,
      {
        drugId: addDrugId,
        pct: addPct,
        t0: addT0,
        mode: addMode
      }
    ]);
  };

  const handleRemoveDose = (idx: number) => {
    setDoses((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCell = cells.find((c) => c.id === cellId) || cells[0];
    onSave({
      id: initialTask?.id || `task-${Date.now().toString(36)}`,
      cellId,
      cellName: selectedCell?.name,
      name: name.trim() || 'Tugas Simulasi',
      doses
    });
    onClose();
  };

  const selectedDrug = Object.values(drugs).find((drug) => (drug.id || `drug-${drug.key}`) === addDrugId) || DEFAULT_DRUGS[addDrugId];
  const refConc = selectedDrug?.refConc || 0.1;
  const calcConc = (addPct / 100) * refConc;

  return (
    <dialog open style={{ width: 'min(520px, 94vw)' }}>
      <form onSubmit={handleSubmit}>
        <h2>{initialTask ? 'Edit Simulasi Waktu' : 'Simulasi Waktu Baru'}</h2>
        <label>
          Nama tugas
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoFocus
          />
        </label>
        <label>
          Sel acuan
          <select value={cellId} onChange={(e) => setCellId(e.target.value)}>
            {cells.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ marginTop: '12px' }}>Dosis obat yang diberikan ({doses.length}/4)</label>
        <div>
          {doses.length === 0 ? (
            <p className="hint">Tanpa obat. Kontrol selalu dijalankan sebagai pembanding.</p>
          ) : (
            doses.map((d, i) => (
              <div key={i} className="tkrow">
                <span className="dot" style={{ background: '#378ADD' }} />
                <span style={{ flex: 1 }}>
                  {Object.values(drugs).find((drug) => (drug.id || `drug-${drug.key}`) === d.drugId)?.name || d.drugId} {d.pct}% @ {d.t0} s ({d.mode})
                </span>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => handleRemoveDose(i)}
                  aria-label="Hapus"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add dose form */}
        <div className="addrow" style={{ marginTop: '10px' }}>
          <label className="full">
            Tambah obat
            <select value={addDrugId} onChange={(e) => setAddDrugId(e.target.value)}>
              {Object.values(drugs).map((d) => (
                <option key={d.id || `drug-${d.key}`} value={d.id || `drug-${d.key}`}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Takaran (% acuan)
            <input
              type="number"
              min="0"
              max="500"
              step="5"
              value={addPct}
              onChange={(e) => setAddPct(Number(e.target.value))}
            />
          </label>
          <label>
            Waktu pemberian (s)
            <input
              type="number"
              min="0"
              max="250"
              step="5"
              value={addT0}
              onChange={(e) => setAddT0(Number(e.target.value))}
            />
          </label>
          <label className="full">
            Mode pemberian
            <select value={addMode} onChange={(e) => setAddMode(e.target.value as 'konstan' | 'bolus')}>
              <option value="konstan">Terus-menerus (konsentrasi tetap)</option>
              <option value="bolus">Sekali beri (meluruh, t½ ~69 s)</option>
            </select>
          </label>
          <button
            type="button"
            className="btn full"
            style={{ marginTop: '8px' }}
            disabled={doses.length >= 4}
            onClick={handleAddDose}
          >
            <Icon name="plus" size={14} /> Tambahkan Dosis
          </button>
        </div>
        <p className="note">
          {calcConc.toFixed(3)} mM · 100% = {refConc.toFixed(3)} mM (takaran acuan ilustratif).
        </p>
        <div className="dlg-f">
          <button type="submit" className="btn primary">Simpan</button>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
        </div>
      </form>
    </dialog>
  );
};

// ----------------- SAVE PROJECT MODAL -----------------
interface SaveProjectModalProps extends ModalProps {
  currentName: string;
  onSave: (name: string) => void;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  onClose,
  currentName,
  onSave
}) => {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (isOpen) setName(currentName);
  }, [currentName, isOpen]);

  if (!isOpen) return null;

  return (
    <dialog open>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim() || 'Proyek Tanpa Judul');
          onClose();
        }}
      >
        <h2>Simpan Proyek</h2>
        <label>
          Nama proyek
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoFocus
          />
        </label>
        <p className="note">
          Project, task, fungsi, satuan custom, dan hasil simulasi akan disimpan ke file project yang kamu pilih.
        </p>
        <div className="dlg-f">
          <button type="submit" className="btn primary">Simpan</button>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
        </div>
      </form>
    </dialog>
  );
};

// ----------------- OPEN PROJECT MODAL -----------------
interface OpenProjectModalProps extends ModalProps {
  projects: string[];
  onOpenProject: (name: string) => void;
  onDeleteProject?: (name: string) => void;
}

export const OpenProjectModal: React.FC<OpenProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  onOpenProject,
  onDeleteProject
}) => {
  if (!isOpen) return null;

  return (
    <dialog open>
      <h2>Buka Proyek Tersimpan</h2>
      <div className="saved-list">
        {projects.length === 0 ? (
          <p className="hint">Belum ada proyek tersimpan di database.</p>
        ) : (
          projects.map((name) => (
            <div key={name} className="saved">
              <div className="info">
                <div>{name}</div>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  onOpenProject(name);
                  onClose();
                }}
              >
                Buka
              </button>
              {onDeleteProject && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => onDeleteProject(name)}
                  aria-label="Hapus"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="dlg-f">
        <button type="button" className="btn" onClick={onClose}>Tutup</button>
      </div>
    </dialog>
  );
};
