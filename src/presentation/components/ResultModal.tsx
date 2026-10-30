import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { CellCanvas, SimulationResultBundle } from './CellCanvas';
import { DEFAULT_SPECIES } from '../../domain/constants';

interface ResultModalProps {
  bundle: SimulationResultBundle | null;
  initialTab?: 'vis' | 'tab' | 'dat';
  onClose: () => void;
}

const T_MAX = 300;
const SPEED = 20;

function nearestSeriesIndex(times: number[], time: number): number {
  if (times.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Math.abs(times[0] - time);
  for (let i = 1; i < times.length; i += 1) {
    const distance = Math.abs(times[i] - time);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  bundle,
  initialTab = 'vis',
  onClose
}) => {
  const [tab, setTab] = useState<'vis' | 'tab' | 'dat'>(initialTab);
  const [scenarioIdx, setScenarioIdx] = useState<number>(0);
  const [selectedVar, setSelectedVar] = useState<string>('PGE2');
  const [playT, setPlayT] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [legendHtml, setLegendHtml] = useState<string>('');
  const [readout, setReadout] = useState<string>('');

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    setTab(initialTab);
    if (bundle && bundle.exps.length > 0) {
      setScenarioIdx(1);
    } else {
      setScenarioIdx(0);
    }
    setPlayT(0);
    setIsPlaying(true);
  }, [bundle, initialTab]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTsRef.current = performance.now();

    const loop = (ts: number) => {
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      setPlayT((prev) => {
        const next = Math.min(T_MAX, prev + dt * SPEED);
        if (next >= T_MAX) {
          setIsPlaying(false);
          return T_MAX;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const togglePlay = () => {
    if (playT >= T_MAX) {
      setPlayT(0);
    }
    setIsPlaying(!isPlaying);
  };

  // Helper series data for charts
  const getSeries = (varKey: string) => {
    if (!bundle) return [];
    const controlSeries = {
      name: 'Kontrol',
      color: '#378ADD',
      t: bundle.control.t || [],
      y: bundle.control.species?.[varKey] || []
    };
    const expSeries = bundle.exps.map((e) => ({
      name: e.name,
      color: e.color,
      t: e.sim.t || [],
      y: e.sim.species?.[varKey] || [],
      t0: e.t0
    }));
    return [controlSeries, ...expSeries];
  };

  const niceMax = (v: number) => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };

  // Render chart on HTML5 Canvas
  useEffect(() => {
    if (tab !== 'dat' || !bundle) return;
    const cv = chartCanvasRef.current;
    if (!cv) return;
    const wrap = cv.parentElement;
    if (!wrap) return;

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);

    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.dataset.theme === 'dark';
    const cText = isDark ? '#b4b2a9' : '#5f5e5a';
    const cGrid = isDark ? '#3a3a37' : '#dedbd3';

    ctx.font = '11px system-ui, sans-serif';

    const series = getSeries(selectedVar);
    const L = 52, R = 14, T = 10, B = 26;
    const pw = w - L - R, ph = h - T - B;
    const dataTimes = series.flatMap((s) => s.t).filter((time) => Number.isFinite(time));
    const timeMax = Math.max(...dataTimes, 0);
    const chartTimeMax = timeMax > 0 ? timeMax : T_MAX;

    let maxV = 0;
    series.forEach((s) => {
      s.y.forEach((v) => {
        if (v > maxV) maxV = v;
      });
    });

    const yMax = niceMax(maxV * 1.05);
    const X = (t: number) => L + (Math.max(0, Math.min(chartTimeMax, t)) / chartTimeMax) * pw;
    const Y = (v: number) => T + ph - (v / yMax) * ph;

    // Y Axis Grid
    ctx.strokeStyle = cGrid;
    ctx.fillStyle = cText;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i;
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(w - R, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(yMax < 1 ? 2 : 1), L - 6, y);
    }

    // X Axis Grid
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let tick = 0; tick <= 5; tick += 1) {
      const t = (chartTimeMax / 5) * tick;
      const x = Math.round(X(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x, T + ph);
      ctx.stroke();
      ctx.fillText(`${t} s`, x, T + ph + 6);
    }

    // Drug injection dashed vertical line
    series.forEach((s) => {
      if ('t0' in s && typeof s.t0 === 'number') {
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(X(s.t0), T);
        ctx.lineTo(X(s.t0), T + ph);
        ctx.stroke();
        ctx.restore();
      }
    });

    // Plot curves
    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.y.forEach((v, i) => {
        const x = X(s.t[i] || 0);
        const y = Y(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Time cursor line
    const curX = X(playT);
    ctx.strokeStyle = cText;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(curX, T);
    ctx.lineTo(curX, T + ph);
    ctx.stroke();
    ctx.setLineDash([]);

    const idx = nearestSeriesIndex(series[0]?.t || [], playT);
    series.forEach((s) => {
      const v = s.y[idx] || 0;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(curX, Y(v), 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Update readout text
    const parts = series.map((s) => `${s.name.split(' ')[0]} ${(s.y[idx] || 0).toFixed(3)}`);
    setReadout(`t = ${playT.toFixed(1)} s · ${parts.join(' · ')} mM`);
  }, [tab, bundle, selectedVar, playT]);

  if (!bundle) return null;

  const idx = Math.min(Math.round(playT / 0.5), (bundle.control.t?.length || 1) - 1);
  const scList = [
    { name: 'Kontrol', sim: bundle.control },
    ...bundle.exps.map((e) => ({ name: e.name, sim: e.sim }))
  ];

  return (
    <dialog ref={dialogRef} id="dlgRes">
      {/* Header */}
      <div className="rh">
        <strong>{bundle.title}</strong>
        <span className="muted">
          {bundle.cellName} · {new Date(bundle.ranAt).toLocaleTimeString('id-ID')}
        </span>
        <span className="grow" />
        <div className="seg" role="tablist" aria-label="Tampilan">
          <button
            className={`segb ${tab === 'vis' ? 'active' : ''}`}
            onClick={() => setTab('vis')}
          >
            Visual
          </button>
          <button
            className={`segb ${tab === 'tab' ? 'active' : ''}`}
            onClick={() => setTab('tab')}
          >
            Tabel
          </button>
          <button
            className={`segb ${tab === 'dat' ? 'active' : ''}`}
            onClick={() => setTab('dat')}
          >
            Data (Grafik)
          </button>
        </div>
        <span className="grow" />
        <button className="tb icon" onClick={onClose} aria-label="Tutup">
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="rb">
        {/* Tab 1: Visual Canvas 2D */}
        <div className={`rpane ${tab === 'vis' ? 'active' : ''}`}>
          <div className="vtools">
            <label>
              Skenario:{' '}
              <select
                value={scenarioIdx}
                onChange={(e) => setScenarioIdx(Number(e.target.value))}
              >
                <option value={0}>Kontrol (Tanpa Obat)</option>
                {bundle.exps.map((exp, i) => (
                  <option key={i} value={i + 1}>
                    {exp.name}
                  </option>
                ))}
              </select>
            </label>
            <span
              className="legend"
              dangerouslySetInnerHTML={{ __html: legendHtml }}
            />
          </div>
          <CellCanvas
            bundle={bundle}
            scenarioIndex={scenarioIdx}
            playT={playT}
            onLegendUpdate={setLegendHtml}
          />
        </div>

        {/* Tab 2: Table */}
        <div className={`rpane ${tab === 'tab' ? 'active' : ''}`}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Zat (mM) pada t = {playT.toFixed(1)} s</th>
                  {scList.map((s, i) => (
                    <th key={i} className="num">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEFAULT_SPECIES.map((sp) => {
                  const baseVal = scList[0]?.sim.species?.[sp.key]?.[idx] || 0;
                  return (
                    <tr key={sp.key}>
                      <td>{sp.name}</td>
                      {scList.map((s, si) => {
                        const val = s.sim.species?.[sp.key]?.[idx] || 0;
                        let diffPct = '';
                        if (si > 0 && baseVal > 1e-9) {
                          const pct = ((val - baseVal) / baseVal) * 100;
                          if (Math.abs(pct) >= 0.05) {
                            diffPct = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
                          }
                        }
                        return (
                          <td key={si} className="num">
                            {val.toFixed(3)}
                            {diffPct && (
                              <span
                                className={diffPct.startsWith('+') ? 'up' : 'down'}
                                style={{ marginLeft: '6px', fontSize: '11px' }}
                              >
                                {diffPct}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tab 3: Chart Data */}
        <div className={`rpane ${tab === 'dat' ? 'active' : ''}`}>
          <div className="res-bar">
            <label>
              Variabel:{' '}
              <select
                value={selectedVar}
                onChange={(e) => setSelectedVar(e.target.value)}
              >
                {DEFAULT_SPECIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="readout">{readout}</span>
          </div>
          <div className="chart-wrap">
            <canvas ref={chartCanvasRef} />
          </div>
        </div>
      </div>

      {/* Footer Playback Controls */}
      <div className="rf">
        <button className="tb primary" onClick={togglePlay}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={15} />
          <span>{isPlaying ? 'Jeda' : 'Putar'}</span>
        </button>
        <input
          type="range"
          min="0"
          max={T_MAX}
          step="0.5"
          value={playT}
          onChange={(e) => {
            setIsPlaying(false);
            setPlayT(Number(e.target.value));
          }}
          aria-label="Waktu Simulasi"
        />
        <span className="muted" style={{ fontVariantNumeric: 'tabular-nums', minWidth: '48px' }}>
          {playT.toFixed(1)} s
        </span>
      </div>
    </dialog>
  );
};

