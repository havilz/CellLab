import { createDefaultProject, addOrUpdateCell } from '../usecases/project';
import { solveOdeLocally } from '../usecases/simulation';
import { CATALOG } from './constants';

export function runSelfCheck(): boolean {
  const project = createDefaultProject('Test Project');
  if (project.name !== 'Test Project') throw new Error('Self check failed: project name mismatch');
  const defaultCell = Object.values(project.cells)[0];
  if (!defaultCell || project.cells[defaultCell.id] !== defaultCell) throw new Error('Self check failed: default cell UID index missing');
  if (Object.keys(CATALOG).length !== 6) throw new Error('Self check failed: catalog items length mismatch');

  const updated = addOrUpdateCell(project, { id: 'cell-2', name: 'Sel Uji', items: [{ key: 'glukosa', conc: 1.0 }] });
  if (!updated.cells['cell-2']) throw new Error('Self check failed: cell update failed');
  const renamed = addOrUpdateCell(updated, { ...updated.cells['cell-2'], name: 'Sel Uji Renamed' });
  if (Object.keys(renamed.cells).length !== Object.keys(updated.cells).length || renamed.cells['cell-2']?.name !== 'Sel Uji Renamed') {
    throw new Error('Self check failed: cell rename changed entity identity');
  }

  // Verify local ODE simulation solver
  const sim = solveOdeLocally([{ key: 'glukosa', conc: 5.0 }, { key: 'atp', conc: 3.2 }], null);
  if (!sim.t || sim.t.length !== 601) throw new Error('Self check failed: simulation time steps mismatch');
  if (!sim.species.G || sim.species.G.length !== 601) throw new Error('Self check failed: simulation species G mismatch');
  if (sim.species.G[0] !== 5.0) throw new Error('Self check failed: initial glucose concentration mismatch');

  return true;
}

// Execute check at module evaluation to ensure validity during build
runSelfCheck();

