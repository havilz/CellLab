import React, { useEffect, useRef } from 'react';
import { ExperimentScenario, SimulationResultBundle } from '../../domain/entities';

export type { ExperimentScenario, SimulationResultBundle };

interface CellCanvasProps {
  bundle: SimulationResultBundle;
  scenarioIndex: number;
  playT: number;
  onLegendUpdate?: (legendHtml: string) => void;
}

const SPECIES_COLORS: Record<string, string> = {
  G: '#1D9E75',
  G6P: '#0F6E56',
  ATP: '#D85A30',
  ADP: '#BA7517',
  Pyr: '#7F77DD',
  AA: '#378ADD',
  PGE2: '#A32D2D'
};

const SPECIES_NAMES: Record<string, string> = {
  G: 'Glukosa',
  G6P: 'G6P',
  ATP: 'ATP',
  ADP: 'ADP',
  Pyr: 'Piruvat',
  AA: 'Asam Arakidonat',
  PGE2: 'PGE2'
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const CellCanvas: React.FC<CellCanvasProps> = ({
  bundle,
  scenarioIndex,
  playT,
  onLegendUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<Record<string, Array<{ x: number; y: number }>>>({});
  const vmaxRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wrap = canvas.parentElement;
    if (!wrap) return;

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isDark = document.documentElement.dataset.theme === 'dark';
    const bg = isDark ? '#181817' : '#f1f0ec';
    const panel2 = isDark ? '#292927' : '#ffffff';
    const line2 = isDark ? '#4c4c47' : '#c8c5bb';
    const text2 = isDark ? '#b4b2a9' : '#5f5e5a';

    const exp = scenarioIndex > 0 ? bundle.exps[scenarioIndex - 1] : null;
    const sim = exp ? exp.sim : bundle.control;
    const idx = clamp(Math.round(playT / 0.5), 0, (sim.t?.length || 1) - 1);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.36;
    const hx = w / (2 * R);
    const hy = h / (2 * R);

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Cell circle (Membrane & Cytoplasm)
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = panel2;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = line2;
    ctx.stroke();

    // GLUT1 Transporter channels on membrane
    const hasGlut = bundle.items.some((i) => i.key === 'glut');
    if (hasGlut) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.4;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.rotate(a);
        ctx.fillStyle = '#378ADD';
        ctx.fillRect(-8, -3.5, 16, 7);
        ctx.restore();
      }
    }

    const rp = (inside: boolean) => {
      for (;;) {
        const x = (Math.random() * 2 - 1) * (inside ? 0.9 : hx);
        const y = (Math.random() * 2 - 1) * (inside ? 0.9 : hy);
        const r = Math.hypot(x, y);
        if (inside ? r < 0.88 : r > 1.15) return { x, y };
      }
    };

    const walk = (key: string, n: number, inside: boolean) => {
      const a = partsRef.current[key] || (partsRef.current[key] = []);
      while (a.length < n) a.push(rp(inside));
      a.length = Math.min(a.length, n);
      a.forEach((p) => {
        p.x += (Math.random() - 0.5) * 0.03;
        p.y += (Math.random() - 0.5) * 0.03;
        const r = Math.hypot(p.x, p.y) || 1;
        if (inside && r > 0.88) {
          p.x *= 0.88 / r;
          p.y *= 0.88 / r;
        }
        if (!inside) {
          if (r < 1.15) {
            p.x *= 1.15 / r;
            p.y *= 1.15 / r;
          }
          p.x = clamp(p.x, -hx, hx);
          p.y = clamp(p.y, -hy, hy);
        }
      });
      return a;
    };

    const dot = (p: { x: number; y: number }, c: string, rad: number) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx + p.x * R, cy + p.y * R, rad, 0, Math.PI * 2);
      ctx.fill();
    };

    // Medium glucose outside cell
    const gx = (bundle.items.find((i) => i.key === 'glukosa') || { conc: 0 }).conc;
    walk('Gx', Math.round((40 * gx) / 10), false).forEach((p) => dot(p, SPECIES_COLORS.G, 3));

    // Drug outside cell
    const calcDrugConc = (e: ExperimentScenario | null, t: number) => {
      if (!e || t < e.t0) return 0;
      return e.mode === 'bolus' ? e.conc * Math.exp(-0.01 * (t - e.t0)) : e.conc;
    };
    const dc = calcDrugConc(exp, playT);
    if (exp) {
      walk('D', exp.conc > 0 ? Math.round((40 * dc) / exp.conc) : 0, false).forEach((p) => {
        ctx.fillStyle = exp.color;
        ctx.fillRect(cx + p.x * R - 3.5, cy + p.y * R - 3.5, 7, 7);
      });
    }

    // Inside species particles
    let legendHtml = '';
    const speciesKeys = ['G', 'G6P', 'ATP', 'ADP', 'Pyr', 'AA', 'PGE2'];
    speciesKeys.forEach((k) => {
      const color = SPECIES_COLORS[k] || '#888';
      const key = `${scenarioIndex}_${k}`;
      const simVals = sim.species?.[k] || [];
      if (vmaxRef.current[key] === undefined && simVals.length > 0) {
        vmaxRef.current[key] = Math.max(...simVals);
      }
      const v = simVals[idx] || 0;
      const vm = vmaxRef.current[key] || 1;
      walk(k, vm > 1e-9 ? Math.round((26 * v) / vm) : 0, true).forEach((p) => dot(p, color, 3.2));
      legendHtml += `<span><i class="dot" style="background:${color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px;"></i>${SPECIES_NAMES[k] || k}: ${v.toFixed(3)}</span> `;
    });

    if (exp) {
      legendHtml += `<span><i class="dot" style="background:${exp.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px;"></i>Obat: ${dc.toFixed(3)} mM</span>`;
    }

    if (onLegendUpdate) {
      onLegendUpdate(legendHtml);
    }

    // Header label
    ctx.fillStyle = text2;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${exp ? exp.name : 'Kontrol, tanpa obat'} · t = ${playT.toFixed(1)} s · densitas partikel relatif`,
      12,
      10
    );
  }, [bundle, scenarioIndex, playT, onLegendUpdate]);

  return (
    <div className="vwrap">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

