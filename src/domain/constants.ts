import { CatalogItem, Drug, Reaction, Species } from './entities';

import glukosa from './builtins/catalog/glukosa.json';
import atp from './builtins/catalog/atp.json';
import aa from './builtins/catalog/aa.json';
import hk from './builtins/catalog/hk.json';
import cox from './builtins/catalog/cox.json';
import glut from './builtins/catalog/glut.json';
import parasetamol from './builtins/drugs/parasetamol.json';
import ibuprofen from './builtins/drugs/ibuprofen.json';
import dg2 from './builtins/drugs/dg2.json';
import r1 from './builtins/reactions/r1.json';
import r2 from './builtins/reactions/r2.json';
import r3 from './builtins/reactions/r3.json';
import r4 from './builtins/reactions/r4.json';
import r5 from './builtins/reactions/r5.json';
import r6 from './builtins/reactions/r6.json';
import r7 from './builtins/reactions/r7.json';

export const CATALOG: Record<string, CatalogItem> = Object.fromEntries(
  [glukosa, atp, aa, hk, cox, glut].map((item) => [item.key, item as CatalogItem])
);

export const DEFAULT_DRUGS: Record<string, Drug> = Object.fromEntries(
  [parasetamol, ibuprofen, dg2].map((drug) => [drug.key, drug as Drug])
);

export const DEFAULT_SPECIES: Species[] = [
  { key: 'G', name: 'Glukosa' },
  { key: 'G6P', name: 'Glukosa-6-fosfat' },
  { key: 'ATP', name: 'ATP' },
  { key: 'ADP', name: 'ADP' },
  { key: 'Pyr', name: 'Piruvat' },
  { key: 'AA', name: 'Asam arakidonat' },
  { key: 'PGE2', name: 'PGE2' }
];

export const DEFAULT_REACTIONS: Reaction[] = [r1, r2, r3, r4, r5, r6, r7] as Reaction[];

export const BUILTIN_FUNCTIONS = [
  { key: 'inhibition-noncompetitive', name: 'Inhibisi non-kompetitif', expression: 'v / (1 + I / Ki)' },
  { key: 'michaelis-menten', name: 'Michaelis-Menten', expression: 'Vmax * E * S / (Km + S)' }
];

export const BUILTIN_UNITS = [
  { key: 'concentration', name: 'Konsentrasi', symbol: 'mM', expression: 'mmol/L' },
  { key: 'time', name: 'Waktu', symbol: 's', expression: 'second' },
  { key: 'cell-volume', name: 'Volume sel', symbol: 'pL', expression: 'picoliter' }
];
