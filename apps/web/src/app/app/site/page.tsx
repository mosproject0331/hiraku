'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  boundaryAreaM2, detectFaces, lonLatToPixel, metersPerPixel, northHeadingInPlan,
  outerBoundary, pixelToLonLat, planAreaM2, solarNoon, solarPosition,
  totalFloorAreaM2, type Site, type XY,
} from '@hiraku/core';
import { GSI_CREDIT, LAYERS, searchAddress, tileUrl, type Layer, type Place } from '@/lib/gsi';
import { jp } from '@/components/Jp';
import { useEditor } from '@/lib/store';

/**
 * 敷地。
 *
 * 図面は家のなかの話しかしないが、建物は土地の上にある向きで建っている。
 * 住所から場所を引き、航空写真の上に図面を置いて、方位を決める。
 * 方位が決まると、光がどこから入るかが決まる——3Dの太陽もここに従う。
 */

/** 航空写真は18まで。それより寄るときは引き伸ばして使う */
const TILE_MAX = 18;
const COMPASS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const dirName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;

export default function SitePage() {
  const model = useEditor((s) => s.model);
  const saved = useEditor((s) => s.site);
  const setSite = useEditor((s) => s.setSite);
  const projectName = useEditor((s) => s.projectName);

  const [query, setQuery] = useState(saved?.address ?? '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [layer, setLayer] = useState<Layer>('photo');
  const [zoom, setZoom] = useState(saved?.zoom ?? 20);
  const [centre, setCentre] = useState<{ lat: number; lon: number } | null>(
    saved ? { lat: saved.lat, lon: saved.lon } : null,
  );
  const [rotation, setRotation] = useState(saved?.rotationDeg ?? 0);
  const [when, setWhen] = useState('12');
  const [drawing, setDrawing] = useState(false);
  const [boundary, setBoundary] = useState<{ lat: number; lon: number }[]>(saved?.boundary ?? []);
  const [coverage, setCoverage] = useState(saved?.coveragePct ? String(saved.coveragePct) : '');
  const [far, setFar] = useState(saved?.farPct ? String(saved.farPct) : '');
  const [limitSource, setLimitSource] = useState(saved?.limitSource ?? '');
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 360 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ── 図面の輪郭 ── */
  const plan = useMemo(() => {
    const level = model.levels[0];
    if (!level || !level.walls.length) return null;
    const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
    const faces = detectFaces(level).map((f) =>
      f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean),
    );
    const segs: { a: XY; b: XY }[] = [];
    for (const w of level.walls) {
      const a = nodeById.get(w.a);
      const b = nodeById.get(w.b);
      if (a && b) segs.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
    }
    const xs = level.nodes.map((n) => n.x);
    const ys = level.nodes.map((n) => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return {
      faces,
      segs,
      centre: { x: cx, y: cy },
      widthMm: Math.max(...xs) - Math.min(...xs),
      depthMm: Math.max(...ys) - Math.min(...ys),
    };
  }, [model]);

  async function doSearch() {
    setError('');
    setBusy(true);
    try {
      const r = await searchAddress(query);
      setResults(r);
      if (r.length === 1) setCentre({ lat: r[0]!.lat, lon: r[0]!.lon });
      if (!r.length) setError('その住所は見つかりませんでした。市区町村までにすると出ることがあります');
    } catch (e) {
      setError(e instanceof Error ? e.message : '住所を引けませんでした');
    } finally {
      setBusy(false);
    }
  }

  /* ── 地図のタイル ── */
  const tileZoom = Math.min(TILE_MAX, zoom);
  const upscale = Math.pow(2, zoom - tileZoom);
  const tileSize = 256 * upscale;
  const mpp = centre ? metersPerPixel(centre.lat, zoom) : 0;

  const tiles = useMemo(() => {
    if (!centre || !size.w || !size.h) return [];
    const p = lonLatToPixel(centre.lon, centre.lat, tileZoom);
    // 画面の左上に対応する、タイル座標系のピクセル
    const left = p.x - size.w / 2 / upscale;
    const top = p.y - size.h / 2 / upscale;
    const x0 = Math.floor(left / 256);
    const y0 = Math.floor(top / 256);
    const x1 = Math.floor((left + size.w / upscale) / 256);
    const y1 = Math.floor((top + size.h / upscale) / 256);
    const out: { key: string; url: string; x: number; y: number }[] = [];
    const n = Math.pow(2, tileZoom);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wrapped = ((tx % n) + n) % n;
        out.push({
          key: `${tx}/${ty}`,
          url: tileUrl(layer, tileZoom, wrapped, ty),
          x: (tx * 256 - left) * upscale,
          y: (ty * 256 - top) * upscale,
        });
      }
    }
    return out;
  }, [centre, size, tileZoom, upscale, layer]);

  /* ── 地図を引っぱって動かす ── */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !centre) return;
    let id: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      if (drawing) return; // 線を引いているあいだは地図を動かさない
      if (id !== null) return;
      id = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      setCentre((c) => {
        if (!c) return c;
        const p = lonLatToPixel(c.lon, c.lat, zoom);
        return pixelToLonLat(p.x - dx, p.y - dy, zoom);
      });
    };
    const up = (e: PointerEvent) => {
      if (id === e.pointerId) id = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [centre, zoom, drawing]);

  /** 地図の上をタップして、敷地の角を置く */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !centre || !drawing) return;
    const onTap = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const p = lonLatToPixel(centre.lon, centre.lat, zoom);
      const px = p.x - r.width / 2 + (e.clientX - r.left);
      const py = p.y - r.height / 2 + (e.clientY - r.top);
      const at = pixelToLonLat(px, py, zoom);
      setBoundary((b) => {
        // 最初の点の近くをもう一度押したら、輪を閉じる（＝描き終わり）
        if (b.length >= 3) {
          const first = lonLatToPixel(b[0]!.lon, b[0]!.lat, zoom);
          if (Math.hypot(first.x - px, first.y - py) < 14) {
            setDrawing(false);
            return b;
          }
        }
        return [...b, at];
      });
    };
    el.addEventListener('pointerdown', onTap);
    return () => el.removeEventListener('pointerdown', onTap);
  }, [centre, zoom, drawing]);

  /* ── 図面を地図に重ねる ── */
  const overlay = useMemo(() => {
    if (!plan || !mpp) return null;
    const k = mpp * 1000; // 1画面ピクセルあたりのmm
    const r = (rotation * Math.PI) / 180;
    // 図面(x,y) → 画面(sx,sy)。画面の右が東、上が北
    const a = Math.sin(r) / k;
    const b = -Math.cos(r) / k;
    const c = Math.cos(r) / k;
    const d = Math.sin(r) / k;
    const e = size.w / 2 - (a * plan.centre.x + c * plan.centre.y);
    const f = size.h / 2 - (b * plan.centre.x + d * plan.centre.y);
    return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  }, [plan, mpp, rotation, size]);

  /* ── この敷地の太陽 ── */
  const sun = useMemo(() => {
    if (!centre) return null;
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(when) || 12, 0, 0);
    const s = solarPosition(day, centre.lat, centre.lon);
    const noon = solarNoon(day, centre.lat, centre.lon);
    return { ...s, noon };
  }, [centre, when]);

  /** 敷地の広さと、建物の広さ */
  const areas = useMemo(() => {
    const siteM2 = boundaryAreaM2(boundary);
    const lv0 = model.levels[0];
    const outline = lv0 ? outerBoundary(lv0) : [];
    // 建築面積は外周の水平投影。軒の出は1mを超えた分だけ算入するのが原則なので、
    // ここでは軒を含めない概算にとどめる
    const buildM2 = planAreaM2(outline);
    const floorM2 = totalFloorAreaM2(model);
    const cov = Number(coverage);
    const f = Number(far);
    return {
      siteM2,
      buildM2,
      floorM2,
      coverageNow: siteM2 > 0 ? (buildM2 / siteM2) * 100 : 0,
      farNow: siteM2 > 0 ? (floorM2 / siteM2) * 100 : 0,
      coverageLimit: Number.isFinite(cov) && cov > 0 ? cov : undefined,
      farLimit: Number.isFinite(f) && f > 0 ? f : undefined,
    };
  }, [boundary, model, coverage, far]);

  const site: Site | null = centre
    ? {
        address: query || saved?.address || '',
        lat: centre.lat,
        lon: centre.lon,
        anchorXMm: plan?.centre.x ?? 0,
        anchorYMm: plan?.centre.y ?? 0,
        rotationDeg: ((rotation % 360) + 360) % 360,
        zoom,
        boundary: boundary.length >= 3 ? boundary : undefined,
        coveragePct: areas.coverageLimit,
        farPct: areas.farLimit,
        limitSource: limitSource.trim() || undefined,
        source: GSI_CREDIT,
        at: new Date().toISOString(),
      }
    : null;

  const north = site ? northHeadingInPlan(site) : 0;
  const barMeters = [1, 2, 5, 10, 20, 50].find((m) => m / (mpp || 1) > 48) ?? 50;

  return (
    <main className="plan sitepage">
      <header>
        <p className="intake-kicker">敷地</p>
        <h1 className="intake-title">{jp('この家は、どこに、どの向きで建っていますか。')}</h1>
        <p className="intake-sub">
          {jp('住所から場所を引き、航空写真の上に図面を置きます。向きが決まると、光がどこから入るかが決まります。3Dの太陽もこの向きに従います。')}
        </p>
      </header>

      <section className="site-search no-print">
        <div className="ask-input">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 兵庫県三田市三輪1-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doSearch();
            }}
          />
          <button className="hb-btn hb-cta" onClick={() => void doSearch()} disabled={busy}>
            {busy ? '探しています…' : '探す'}
          </button>
        </div>
        {error && <p className="hb-warn site-err">{error}</p>}
        {results && results.length > 1 && (
          <ul className="site-results">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => {
                    setCentre({ lat: r.lat, lon: r.lon });
                    setQuery(r.title);
                    setResults(null);
                  }}
                >
                  {r.title}
                  <em>{r.lat.toFixed(5)}, {r.lon.toFixed(5)}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!plan && (
        <p className="hb-warn site-err">
          図面がまだありません。先に間取りをつくると、この地図の上に重ねられます。
        </p>
      )}

      <section className="site-map-wrap">
        <div className="site-map" ref={boxRef}>
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={t.url}
              alt=""
              draggable={false}
              style={{ left: t.x, top: t.y, width: tileSize, height: tileSize }}
            />
          ))}
          {!centre && <p className="site-empty">住所を入れると、ここに地図が出ます</p>}
          {centre && boundary.length > 0 && (
            <svg className="site-overlay" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h}>
              {(() => {
                const c = lonLatToPixel(centre.lon, centre.lat, zoom);
                const pts = boundary
                  .map((b) => {
                    const p = lonLatToPixel(b.lon, b.lat, zoom);
                    return `${p.x - c.x + size.w / 2},${p.y - c.y + size.h / 2}`;
                  })
                  .join(' ');
                return (
                  <>
                    <polygon points={pts} fill="rgba(47,122,88,.14)" stroke="#2f7a58" strokeWidth={2}
                      strokeDasharray={drawing ? '6 4' : undefined} />
                    {boundary.map((b, i) => {
                      const p = lonLatToPixel(b.lon, b.lat, zoom);
                      return (
                        <circle key={i} cx={p.x - c.x + size.w / 2} cy={p.y - c.y + size.h / 2} r={4}
                          fill="#fff" stroke="#2f7a58" strokeWidth={2} />
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          )}
          {overlay && (
            <svg className="site-overlay" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h}>
              <g transform={overlay}>
                {plan!.faces.map((pts, i) => (
                  <polygon
                    key={i}
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(255,119,60,.22)"
                    stroke="none"
                  />
                ))}
                {plan!.segs.map((sg, i) => (
                  <line
                    key={i}
                    x1={sg.a.x} y1={sg.a.y} x2={sg.b.x} y2={sg.b.y}
                    stroke="#1e1e24"
                    strokeWidth={120}
                    strokeLinecap="square"
                    vectorEffect="non-scaling-stroke"
                    style={{ strokeWidth: 2 }}
                  />
                ))}
              </g>
            </svg>
          )}
          <div className="site-compass" aria-label="真北">
            <svg viewBox="0 0 40 52" width="30" height="39">
              <path d="M20 3 L27 34 L20 29 L13 34 Z" fill="#1e1e24" />
              <text x="20" y="49" textAnchor="middle" fontSize="12" fill="#1e1e24" fontWeight="700">N</text>
            </svg>
          </div>
          {centre && (
            <div className="site-scalebar">
              <span style={{ width: Math.round(barMeters / mpp) }} />
              <em>{barMeters}m</em>
            </div>
          )}
          <span className="site-credit">{GSI_CREDIT}</span>
        </div>
      </section>

      <section className="site-controls no-print">
        <div className="chiprow">
          {LAYERS.map((l) => (
            <button key={l.id} className={'chip' + (layer === l.id ? ' on' : '')} onClick={() => setLayer(l.id)}>
              {l.label}
            </button>
          ))}
          <span className="chipgap" />
          <button className="chip" onClick={() => setZoom((z) => Math.max(15, z - 1))} aria-label="引く">−</button>
          <span className="site-zoom">縮尺 1:{Math.round(mpp * 1000 / 0.264)}</span>
          <button className="chip" onClick={() => setZoom((z) => Math.min(21, z + 1))} aria-label="寄る">＋</button>
        </div>

        <div className="chiprow site-boundary-tools">
          <button className={'chip' + (drawing ? ' on' : '')} onClick={() => setDrawing((v) => !v)}>
            {drawing ? '引き終わる' : '敷地の線を引く'}
          </button>
          {boundary.length > 0 && (
            <>
              <button className="chip" onClick={() => setBoundary((b) => b.slice(0, -1))}>1点戻す</button>
              <button className="chip" onClick={() => { setBoundary([]); setDrawing(false); }}>消す</button>
            </>
          )}
          {drawing && <span className="numpad-note">地図を押して角を置き、最初の点でもう一度押すと閉じます</span>}
        </div>

        <div className="site-rot">
          <label>
            <span>図面の右が向いている方位</span>
            <input
              type="range" min={0} max={359} value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </label>
          <div className="chiprow">
            {[0, 90, 180, 270].map((d) => (
              <button key={d} className={'chip' + (rotation === d ? ' on' : '')} onClick={() => setRotation(d)}>
                {d}°
              </button>
            ))}
            <button className="chip" onClick={() => setRotation((r) => (r + 359) % 360)}>−1°</button>
            <button className="chip" onClick={() => setRotation((r) => (r + 1) % 360)}>＋1°</button>
            <b className="site-deg">{rotation}° / {dirName(rotation)}</b>
          </div>
        </div>
      </section>

      {site && (
        <section className="site-facts">
          <h3>決まったこと</h3>
          <dl>
            <div><dt>住所</dt><dd>{site.address || '（未入力）'}</dd></div>
            <div><dt>緯度経度</dt><dd className="num">{site.lat.toFixed(6)}, {site.lon.toFixed(6)}</dd></div>
            <div><dt>図面の向き</dt><dd className="num">{site.rotationDeg}°（右が{dirName(site.rotationDeg)}）</dd></div>
            <div><dt>真北</dt><dd className="num">図面のなかで {Math.round(north)}° の向き</dd></div>
            {plan && (
              <div>
                <dt>建物の大きさ</dt>
                <dd className="num">{(plan.widthMm / 1000).toFixed(2)} × {(plan.depthMm / 1000).toFixed(2)} m</dd>
              </div>
            )}
            <div><dt>出典</dt><dd>{GSI_CREDIT}</dd></div>
          </dl>
        </section>
      )}

      {(boundary.length >= 3 || coverage || far) && (
        <section className="site-limits">
          <h3>敷地と建物の大きさ</h3>
          <dl>
            <div><dt>敷地面積</dt><dd className="num">{areas.siteM2 ? `${areas.siteM2.toFixed(1)} ㎡（${(areas.siteM2 / 3.30578).toFixed(1)}坪）` : '（線を引くと出ます）'}</dd></div>
            <div><dt>建築面積</dt><dd className="num">{areas.buildM2.toFixed(1)} ㎡</dd></div>
            <div><dt>延床面積</dt><dd className="num">{areas.floorM2.toFixed(1)} ㎡</dd></div>
          </dl>

          <div className="site-limitin no-print">
            <label className="numpad-field">
              <span>建ぺい率</span>
              <input type="number" inputMode="numeric" value={coverage} onChange={(e) => setCoverage(e.target.value)} />
              <b>%</b>
            </label>
            <label className="numpad-field">
              <span>容積率</span>
              <input type="number" inputMode="numeric" value={far} onChange={(e) => setFar(e.target.value)} />
              <b>%</b>
            </label>
            <label className="numpad-field wide">
              <span>どこで聞いたか</span>
              <input value={limitSource} placeholder="例: 三田市 都市計画課 2026-08-20" onChange={(e) => setLimitSource(e.target.value)} />
            </label>
          </div>
          <p className="site-limitnote">
            建ぺい率・容積率はこの道具では作れません（地区で決まります）。
            都市計画課で聞いた数字を入れてください。入れた数字は聞いた事実として残ります。
          </p>

          {areas.siteM2 > 0 && (areas.coverageLimit || areas.farLimit) && (
            <ul className="site-judge">
              {areas.coverageLimit && (
                <li className={areas.coverageNow > areas.coverageLimit ? 'over' : 'ok'}>
                  建ぺい率 いま <b className="num">{areas.coverageNow.toFixed(1)}%</b> ／ 上限 {areas.coverageLimit}%
                  — {areas.coverageNow > areas.coverageLimit ? '超えています。増築はできません（既存不適格の可能性）' : '余裕があります'}
                </li>
              )}
              {areas.farLimit && (
                <li className={areas.farNow > areas.farLimit ? 'over' : 'ok'}>
                  容積率 いま <b className="num">{areas.farNow.toFixed(1)}%</b> ／ 上限 {areas.farLimit}%
                  — {areas.farNow > areas.farLimit ? '超えています' : `あと ${((areas.farLimit - areas.farNow) / 100 * areas.siteM2).toFixed(1)}㎡ 積めます`}
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      {sun && (
        <section className="site-sun no-print">
          <h3>この敷地の太陽</h3>
          <div className="chiprow">
            {['7', '9', '12', '15', '17'].map((h) => (
              <button key={h} className={'chip' + (when === h ? ' on' : '')} onClick={() => setWhen(h)}>
                {h}時
              </button>
            ))}
          </div>
          <p className="site-sunline">
            今日の{when}時 — 高さ <b className="num">{sun.altitudeDeg.toFixed(0)}°</b>、
            方位 <b className="num">{sun.azimuthDeg.toFixed(0)}°</b>（{dirName(sun.azimuthDeg)}）
            {sun.altitudeDeg <= 0 && <em>／ 地平線の下</em>}
          </p>
          <p className="site-sunnote">
            いちばん高くなるのは {sun.noon.getHours()}時{String(sun.noon.getMinutes()).padStart(2, '0')}分ごろ。
            向きを決めると、3Dの朝・昼・夕がこの土地の実際の光になります。
          </p>
        </section>
      )}

      <div className="sheet-actions no-print">
        <button className="hb-btn hb-cta" disabled={!site} onClick={() => site && setSite(site)}>
          この敷地で決める
        </button>
        <button className="hb-btn hb-outline" onClick={() => window.print()} disabled={!centre}>
          配置図を印刷
        </button>
        {saved && (
          <button className="hb-btn hb-outline" onClick={() => setSite(null)}>敷地を外す</button>
        )}
      </div>

      <p className="plan-note print-only">
        {projectName || '無題の物件'} ／ 配置図 ／ {site?.address} ／ 方位 真北は図面のなかで{Math.round(north)}°
      </p>
    </main>
  );
}
