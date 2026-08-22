'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { buildRenovationScene, type RenovationOp, type SpaceModel } from '@hiraku/core';
import {
  buildPrompt,
  getApiKey,
  renderPerspective,
  setApiKey,
  type PerspectiveResult,
} from '@/lib/perspective';
import type { SceneViewHandle } from '@/components/SceneView';

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

const LIGHTS = [
  { id: 'morning', label: '朝の光', phrase: 'early morning light, long soft shadows' },
  { id: 'noon', label: '昼の光', phrase: 'bright diffuse daylight, late morning' },
  { id: 'evening', label: '夕方', phrase: 'warm low evening sun raking across the floor' },
  { id: 'night', label: '夜', phrase: 'night, only the interior lights are on, warm and quiet' },
] as const;

export default function PlanPerspective({
  model,
  ops,
  planName,
  desiredUse,
}: {
  model: SpaceModel;
  ops: RenovationOp[];
  planName: string;
  desiredUse?: string;
}) {
  const scene = useMemo(() => buildRenovationScene(model, ops), [model, ops]);
  const [camIndex, setCamIndex] = useState(0);
  const [light, setLight] = useState<(typeof LIGHTS)[number]>(LIGHTS[1]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PerspectiveResult | null>(null);
  const [error, setError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [needKey, setNeedKey] = useState(false);
  const viewRef = useRef<SceneViewHandle>(null);

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
    const png = viewRef.current?.capture();
    if (!png) {
      setError('3Dの画面を取り込めませんでした');
      return;
    }
    setBusy(true);
    try {
      const prompt = buildPrompt(scene, camera!.label, {
        use: desiredUse ? USE_LABELS[desiredUse] : undefined,
        light: light.phrase,
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
      <div className="persp-view">
        {result ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.dataUrl} alt={`${planName}のパース（AI生成）`} />
        ) : (
          <SceneView ref={viewRef} scene={scene} camera={camera} />
        )}
        <span className="persp-tag">{result ? 'AI生成のイメージ' : '3Dモデル（実寸）'}</span>
      </div>

      <div className="persp-controls">
        <select
          value={camIndex}
          onChange={(e) => {
            setCamIndex(Number(e.target.value));
            setResult(null);
          }}
          className="hb-field"
          aria-label="視点"
        >
          {scene.cameras.map((c, i) => (
            <option key={c.id} value={i}>{c.label}</option>
          ))}
        </select>
        <select
          value={light.id}
          onChange={(e) => setLight(LIGHTS.find((l) => l.id === e.target.value) ?? LIGHTS[1])}
          className="hb-field"
          aria-label="光"
        >
          {LIGHTS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button onClick={() => void makePerspective()} disabled={busy} className="hb-btn hb-cta">
          {busy ? '描いています…' : result ? '描き直す' : 'パースをつくる'}
        </button>
        {result && (
          <button onClick={() => setResult(null)} className="hb-btn hb-outline">3Dに戻す</button>
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
        3Dは実測・作図した寸法そのものです。パースはその形を保ったまま、材質と光だけを写実化したイメージで、
        施工後の仕上がりを約束するものではありません。
      </p>
    </div>
  );
}
