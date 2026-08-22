'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  runDiagnosis,
  USE_LABEL,
  ZONE_LABEL,
  type DesiredUse,
  type DiagnosisInput,
  type YoutoChiiki,
} from '@hiraku/rules';
import { renderDiagnosisReport } from '@hiraku/report';
import ReportFrame from '@/components/ReportFrame';
import { listRegionPacks } from '@hiraku/regionpack';
import { useEditor } from '@/lib/store';

type Partial_ = Partial<DiagnosisInput> & { setsudo: DiagnosisInput['setsudo'] };

const ZONES = Object.keys(ZONE_LABEL) as YoutoChiiki[];
const USES = Object.keys(USE_LABEL) as DesiredUse[];

interface ChoiceStep {
  key: string;
  q: string;
  help?: string;
  options: { value: string; label: string }[];
  apply: (d: Partial_, v: string) => void;
  current: (d: Partial_) => string | undefined;
}

export default function DiagnosePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">読み込み中…</main>}>
      <DiagnoseInner />
    </Suspense>
  );
}

function DiagnoseInner() {
  const search = useSearchParams();
  const [step, setStep] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [data, setData] = useState<Partial_>({ setsudo: { flag: 'unknown' } });
  // ランディングのチップから用途を引き継ぐ
  useEffect(() => {
    const u = search.get('use');
    if (u && (USES as string[]).includes(u)) {
      setData((d) => ({ ...d, desiredUse: u as DesiredUse }));
      setStep((s) => (s === 0 ? s : s));
    }
  }, [search]);
  const [address, setAddress] = useState('');
  const [geo, setGeo] = useState<string | null>(null);
  const [areaText, setAreaText] = useState('');
  const [floorsText, setFloorsText] = useState('');
  const [yearText, setYearText] = useState('');
  const [roadW, setRoadW] = useState('');

  const choiceSteps: ChoiceStep[] = useMemo(
    () => [
      {
        key: 'desiredUse',
        q: 'この物件で、何をやりたいですか?',
        options: USES.map((u) => ({ value: u, label: USE_LABEL[u] })),
        apply: (d, v) => (d.desiredUse = v as DesiredUse),
        current: (d) => d.desiredUse,
      },
      {
        key: 'youtoChiiki',
        q: '用途地域はわかりますか?',
        help: '自治体の「都市計画情報マップ」で住所から調べられます。わからなければ「わからない」でOK。調べ方はレポートに載ります。',
        options: [...ZONES.map((z) => ({ value: z, label: ZONE_LABEL[z] })), { value: 'unknown', label: 'わからない' }],
        apply: (d, v) => (d.youtoChiiki = v as DiagnosisInput['youtoChiiki']),
        current: (d) => d.youtoChiiki,
      },
      {
        key: 'kuikiKubun',
        q: '区域区分はわかりますか?',
        help: '「市街化調整区域」と言われたことがあるかどうかは大きな分かれ目です。',
        options: [
          { value: 'shigaika', label: '市街化区域' },
          { value: 'chosei', label: '市街化調整区域' },
          { value: 'hisenbiki', label: '非線引き区域' },
          { value: 'kuikigai', label: '都市計画区域外' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.kuikiKubun = v as DiagnosisInput['kuikiKubun']),
        current: (d) => d.kuikiKubun,
      },
      {
        key: 'bokaChiiki',
        q: '防火地域・準防火地域の指定はありますか?',
        options: [
          { value: 'boka', label: '防火地域' },
          { value: 'junboka', label: '準防火地域' },
          { value: 'none', label: '指定なし' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.bokaChiiki = v as DiagnosisInput['bokaChiiki']),
        current: (d) => d.bokaChiiki,
      },
      {
        key: 'kensazumi',
        q: '検査済証はありますか?',
        help: '建物が適法に建てられた証明書です。所有者に聞いてみてください。古い家では無いことも珍しくありません。',
        options: [
          { value: 'yes', label: 'ある' },
          { value: 'no', label: 'ない' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.kensazumi = v as DiagnosisInput['kensazumi']),
        current: (d) => d.kensazumi,
      },
      {
        key: 'currentUse',
        q: '現在(直前まで)の使われ方は?',
        options: [
          { value: 'jutaku', label: '住宅' },
          { value: 'tenpo', label: '店舗・事務所など' },
          { value: 'other', label: 'その他(倉庫・納屋など)' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.currentUse = v as DiagnosisInput['currentUse']),
        current: (d) => d.currentUse,
      },
      {
        key: 'landCategory',
        q: '土地の地目は?',
        help: '登記簿に書かれています。敷地の一部が田・畑のこともあります。',
        options: [
          { value: 'takuchi', label: '宅地' },
          { value: 'ta', label: '田' },
          { value: 'hatake', label: '畑' },
          { value: 'other', label: 'その他' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.landCategory = v as DiagnosisInput['landCategory']),
        current: (d) => d.landCategory,
      },
      {
        key: 'haisui',
        q: '排水はどうなっていますか?',
        options: [
          { value: 'gesui', label: '下水道' },
          { value: 'jokaso', label: '浄化槽' },
          { value: 'kumitori', label: '汲取り' },
          { value: 'unknown', label: 'わからない' },
        ],
        apply: (d, v) => (d.haisui = v as DiagnosisInput['haisui']),
        current: (d) => d.haisui,
      },
    ],
    [],
  );

  // ステップ構成: 0=住所 / 1=接道 / 2=規模・築年 / 3..=choiceSteps / 最後=生成
  const totalSteps = 3 + choiceSteps.length;

  async function tryGeocode() {
    if (!address.trim()) return;
    try {
      const res = await fetch(
        'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(address),
        { signal: AbortSignal.timeout(5000) },
      );
      const arr = (await res.json()) as { geometry?: { coordinates?: [number, number] } }[];
      const c = arr?.[0]?.geometry?.coordinates;
      if (c) {
        setData((d) => ({ ...d, lat: c[1], lng: c[0] }));
        setGeo(`位置を取得しました (${c[1].toFixed(4)}, ${c[0].toFixed(4)})`);
      } else {
        setGeo('見つかりませんでした(住所だけ記録します)');
      }
    } catch {
      setGeo('検索できませんでした(オフライン? 住所だけ記録します)');
    }
  }

  function finish() {
    const input: DiagnosisInput = {
      address: address.trim() || undefined,
      lat: data.lat,
      lng: data.lng,
      youtoChiiki: data.youtoChiiki ?? 'unknown',
      kuikiKubun: data.kuikiKubun ?? 'unknown',
      bokaChiiki: data.bokaChiiki ?? 'unknown',
      setsudo: data.setsudo,
      floorAreaM2: areaText ? Number(areaText) : undefined,
      floors: floorsText ? Number(floorsText) : undefined,
      builtYear: yearText ? Number(yearText) : undefined,
      kensazumi: data.kensazumi ?? 'unknown',
      currentUse: data.currentUse ?? 'unknown',
      desiredUse: data.desiredUse ?? 'cafe',
      landCategory: data.landCategory ?? 'unknown',
      haisui: data.haisui ?? 'unknown',
    };
    const report = runDiagnosis(input);
    useEditor.getState().setDiagnosis(input, report);
    setHtml(renderDiagnosisReport(input, report, useEditor.getState().regionPackId));
  }

  if (html) return <div className="h-screen"><ReportFrame html={html} onBack={() => setHtml(null)} /></div>;

  const Frame = ({ children, canNext = true }: { children: React.ReactNode; canNext?: boolean }) => (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <a href="/app" className="text-sm text-slate-500 hover:text-slate-800">← HIRAKU</a>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-slate-700 transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
      </div>
      <div className="mt-1 text-right text-xs text-slate-400">{step + 1} / {totalSteps}</div>
      {children}
      <div className="mt-8 flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          戻る
        </button>
        {step < totalSteps - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="rounded bg-slate-800 px-5 py-2 text-sm text-white disabled:opacity-40"
          >
            次へ
          </button>
        ) : (
          <button onClick={finish} disabled={!canNext} className="rounded bg-slate-800 px-5 py-2 text-sm text-white disabled:opacity-40">
            診断レポートをつくる
          </button>
        )}
      </div>
    </main>
  );

  if (step === 0) {
    return (
      <Frame>
        <h1 className="mt-6 text-xl font-bold">物件の住所を教えてください(任意)</h1>
        <p className="mt-1 text-sm text-slate-500">わからなくても診断できます。空欄のまま次へ進んでOKです。</p>
        <div className="mt-4 flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例: 兵庫県三田市屋敷町1-1"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={() => void tryGeocode()} className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            位置を調べる
          </button>
        </div>
        {geo && <p className="mt-2 text-xs text-slate-500">{geo}</p>}
        <label className="mt-5 block text-sm hb-muted">
          地域パック（選ぶと、その地域の補助金・窓口・条例の論点がレポートに付きます）
          <select
            value={useEditor.getState().regionPackId ?? ''}
            onChange={(e) => useEditor.getState().setRegionPackId(e.target.value || undefined)}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">なし（全国共通の法律だけで診断）</option>
            {listRegionPacks().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </Frame>
    );
  }

  if (step === 1) {
    const flag = data.setsudo.flag;
    return (
      <Frame>
        <h1 className="mt-6 text-xl font-bold">前面道路(接道)の様子は?</h1>
        <p className="mt-1 text-sm text-slate-500">建物の敷地がどんな道路に接しているかは、活用の自由度を大きく左右します。</p>
        <div className="mt-4 grid gap-2">
          {(
            [
              ['ok', '普通に道路に接している'],
              ['hatazao', '旗竿地(細い通路の奥にある)'],
              ['none', '道路に接していないかもしれない'],
              ['unknown', 'わからない'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setData((d) => ({ ...d, setsudo: { ...d.setsudo, flag: v } }))}
              className={
                'rounded-lg border px-4 py-3 text-left text-sm ' +
                (flag === v ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white hover:border-slate-400')
              }
            >
              {label}
            </button>
          ))}
        </div>
        {flag === 'ok' && (
          <label className="mt-4 block text-sm">
            道路の幅はだいたい何mですか?(車1台分で約3m)
            <input
              value={roadW}
              onChange={(e) => {
                setRoadW(e.target.value);
                const n = Number(e.target.value);
                setData((d) => ({ ...d, setsudo: { ...d.setsudo, roadWidthM: isNaN(n) || !e.target.value ? undefined : n } }));
              }}
              type="number"
              placeholder="例: 4"
              className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        )}
      </Frame>
    );
  }

  if (step === 2) {
    return (
      <Frame>
        <h1 className="mt-6 text-xl font-bold">建物の規模と築年を教えてください</h1>
        <p className="mt-1 text-sm text-slate-500">わからない項目は空欄でOK。延床面積は200㎡を境に手続きが変わるので、特に大事です。</p>
        <div className="mt-4 grid gap-4">
          <label className="text-sm">
            延床面積(㎡)
            <input value={areaText} onChange={(e) => setAreaText(e.target.value)} type="number" placeholder="例: 150"
              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            階数
            <input value={floorsText} onChange={(e) => setFloorsText(e.target.value)} type="number" placeholder="例: 2"
              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            建築年(西暦)
            <input value={yearText} onChange={(e) => setYearText(e.target.value)} type="number" placeholder="例: 1975"
              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </Frame>
    );
  }

  const cs = choiceSteps[step - 3]!;
  const cur = cs.current(data);
  return (
    <Frame canNext={cur != null}>
      <h1 className="mt-6 text-xl font-bold">{cs.q}</h1>
      {cs.help && <p className="mt-1 text-sm text-slate-500">{cs.help}</p>}
      <div className="mt-4 grid gap-2">
        {cs.options.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              setData((d) => {
                const nd = { ...d, setsudo: { ...d.setsudo } };
                cs.apply(nd, o.value);
                return nd;
              });
              // 選択したら自動で次へ(最後の画面は「診断レポートをつくる」を押してもらう)
              if (step < totalSteps - 1) window.setTimeout(() => setStep((x) => x + 1), 180);
            }}
            className={
              'rounded-lg border px-4 py-2.5 text-left text-sm ' +
              (cur === o.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white hover:border-slate-400')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </Frame>
  );
}
