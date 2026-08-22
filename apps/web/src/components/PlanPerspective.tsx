'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { buildRenovationScene, type RenovationOp, type SpaceModel } from '@hiraku/core';
import {
  buildPrompt, getApiKey, renderPerspective, setApiKey, type PerspectiveResult,
} from '@/lib/perspective';
import { describeSun, type LightKey } from '@/lib/archviz';
import { detectTier, profileFor, type Tier } from '@/lib/quality';
import type { SceneViewHandle } from '@/components/SceneView';
import { useEditor } from '@/lib/store';

const SceneView = dynamic(() => import('@/components/SceneView'), { ssr: false });

const USE_LABELS: Record<string, string> = {
  cafe: 'a small neighbourhood cafe',
  minpaku: 'a guest house for short stays',
  kani_shukuhaku: 'a small lodging house',
  sharehouse: 'a share house living room',
  atelier: 'a maker studio / workshop',
  retail: 'a small retail shop',
  coworking: 'a co-working space',
  library: 'a private library / reading room',
  home_plus: 'a home with a small shop',
};

const LIGHTS: { id: LightKey; label: string; phrase: string }[] = [
  { id: 'morning', label: '朝', phrase: 'early morning sun, long soft shadows raking across the floor' },
  { id: 'noon', label: '昼', phrase: 'bright diffuse daylight, late morning, sun patch on the floor' },
  { id: 'evening', label: '夕', phrase: 'warm low evening sun, deep orange light through the openings' },
  { id: 'night', label: '夜', phrase: 'night, only the interior lamps are lit, warm and quiet, dark windows' },
];

/** 季節。空き家は冬の光でどう見えるかが効く */
const SEASONS: { id: string; label: string; month: number; day: number }[] = [
  { id: 'today', label: '今日', month: 0, day: 0 },
  { id: 'spring', label: '春分', month: 3, day: 21 },
  { id: 'summer', label: '夏至', month: 6, day: 21 },
  { id: 'autumn', label: '秋分', month: 9, day: 23 },
  { id: 'winter', label: '冬至', month: 12, day: 21 },
];

const TIERS: { id: Tier | 'auto'; label: string }[] = [
  { id: 'auto', label: '自動' },
  { id: 'low', label: '軽い' },
  { id: 'mid', label: '標準' },
  { id: 'high', label: 'きれい' },
];

export default function PlanPerspective({
  model, ops, planName, desiredUse,
}: {
  model: SpaceModel;
  ops: RenovationOp[];
  planName: string;
  desiredUse?: string;
}) {
  const levelIndex = useEditor((s) => s.levelIndex);
  const li = Math.min(levelIndex, model.levels.length - 1);
  const scene = useMemo(() => buildRenovationScene(model, ops, li), [model, ops, li]);
  const [camIndex, setCamIndex] = useState(0);
  const [light, setLight] = useState<LightKey>('noon');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PerspectiveResult | null>(null);
  const [error, setError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [needKey, setNeedKey] = useState(false);
  const [pick, setPick] = useState<Tier | 'auto'>('auto');
  const [season, setSeason] = useState('today');
  const [auto, setAuto] = useState<Tier>('mid');
  const [live, setLive] = useState(false);
  const viewRef = useRef<SceneViewHandle>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setAuto(detectTier()), []);

  // 画面に入ったときだけ3Dを動かす。携帯でカードを並べても電池と描画が持つように
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setLive(true);
      return;
    }
    let off: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          if (off) clearTimeout(off);
          off = null;
          setLive(true);
        } else if (!off) {
          off = setTimeout(() => setLive(false), 4000);
        }
      },
      { rootMargin: '150px 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (off) clearTimeout(off);
    };
  }, []);

  const site = useEditor((s) => s.site);
  const when = useMemo(() => {
    const s = SEASONS.find((x) => x.id === season);
    if (!s || !s.month) return undefined;
    return new Date(new Date().getFullYear(), s.month - 1, s.day, 12, 0, 0);
  }, [season]);
  const quality = useMemo(() => profileFor(pick === 'auto' ? auto : pick), [pick, auto]);
  const camera = scene.cameras[camIndex];

  if (!camera) {
    return (
      <p className="hb-faint" style={{ fontSize: 12.5, lineHeight: 1.8 }}>
        部屋が認識できていないため、パースをつくれません。間取りを先に整えてください。
      </p>
    );
  }

  async function makePerspective() {
    setError('');
    const key = getApiKey();
    if (!key) {
      setNeedKey(true);
      return;
    }
    setBusy(true);
    try {
      const png = await viewRef.current?.capture();
      if (!png) throw new Error('3Dの画面を取り込めませんでした');
      const prompt = buildPrompt(scene, camera!.label, {
        use: desiredUse ? USE_LABELS[desiredUse] : undefined,
        light: LIGHTS.find((l) => l.id === light)?.phrase,
      });
      setResult(await renderPerspective(png, prompt, key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'パースの生成に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="persp">
      <div className="persp-view" ref={boxRef}>
        {result ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.dataUrl} alt={`${planName}のパース（AI生成）`} />
        ) : live ? (
          <SceneView
            /* 画質を変えると合成の構成そのものが変わるので、作り直す */
            key={quality.tier}
            ref={viewRef}
            scene={scene}
            camera={camera}
            light={light}
            quality={quality}
            use={desiredUse}
            site={site}
            when={when}
          />
        ) : (
          <div className="persp-idle">3D</div>
        )}
        <span className="persp-tag">{result ? 'AI生成のイメージ' : '3D（実寸）'}</span>
        {!result && live && (
          <span className="persp-hint">
            {site ? describeSun(site, light, when) : '横になぞると見回せます'}
          </span>
        )}
      </div>

      <div className="chiprow" role="group" aria-label="視点">
        {scene.cameras.map((c, i) => (
          <button
            key={c.id}
            className={'chip' + (i === camIndex ? ' on' : '')}
            onClick={() => {
              setCamIndex(i);
              setResult(null);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="chiprow" role="group" aria-label="光">
        {LIGHTS.map((l) => (
          <button
            key={l.id}
            className={'chip' + (l.id === light ? ' on' : '')}
            onClick={() => setLight(l.id)}
          >
            {l.label}
          </button>
        ))}
        <span className="chipgap" />
        {site &&
          SEASONS.map((s) => (
            <button
              key={s.id}
              className={'chip chip-q' + (s.id === season ? ' on' : '')}
              onClick={() => setSeason(s.id)}
              title="季節で光の高さが変わります"
            >
              {s.label}
            </button>
          ))}
        {site && <span className="chipgap" />}
        {TIERS.map((t) => (
          <button
            key={t.id}
            className={'chip chip-q' + (t.id === pick ? ' on' : '')}
            onClick={() => setPick(t.id)}
            title="描き込みの細かさ"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="persp-actions">
        <button onClick={() => void makePerspective()} disabled={busy} className="hb-btn hb-cta">
          {busy ? '描いています…' : result ? '描き直す' : '写真のようにする'}
        </button>
        {result && (
          <>
            <button onClick={() => setResult(null)} className="hb-btn hb-outline">3Dに戻す</button>
            <a href={result.dataUrl} download={`${planName}-パース.png`} className="hb-btn hb-outline">保存</a>
          </>
        )}
      </div>

      {needKey && (
        <div className="hb-warn" style={{ marginTop: 10 }}>
          <b>画像生成のAPIキーが必要です</b>
          <p style={{ margin: '6px 0 8px', fontSize: 12.5, lineHeight: 1.8 }}>
            Google AI Studio で取得した Gemini のキーを入れてください。
            キーはこの端末のブラウザにだけ保存され、Google 以外には送られません。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="APIキーを貼り付け"
              className="hb-field"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              className="hb-btn hb-dark"
              onClick={() => {
                setApiKey(keyInput.trim());
                setKeyInput('');
                setNeedKey(false);
                void makePerspective();
              }}
            >
              保存して描く
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11.5 }}>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              キーの取得はこちら
            </a>
            （生成のたびに Google 側で料金が発生します）
          </p>
        </div>
      )}

      {error && <p className="hb-warn" style={{ marginTop: 10, fontSize: 12.5 }}>{error}</p>}

      <p className="persp-note">
        {site
          ? `太陽は ${site.address || 'この敷地'} の緯度経度と、決めた方位から出しています。`
          : '敷地を決めると、太陽が本当の方位と季節にそろいます。'}
        3Dは実測・作図した寸法そのものです。家具は広さの見当をつけるための添景で、寸法の指定ではありません。
        写真化したものは仕上がりのイメージで、施工後を約束するものではありません。
      </p>
    </div>
  );
}
