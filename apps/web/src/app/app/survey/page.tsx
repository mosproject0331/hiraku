'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { renderSurveyReport, type ChecklistReportRow } from '@hiraku/report';
import { COMMON_VIEWING, USE_VIEWING } from '@hiraku/rules';
import ReportFrame from '@/components/ReportFrame';
import { useEditor } from '@/lib/store';
import { getPhotos } from '@/lib/photo-store';

export default function SurveyPage() {
  const model = useEditor((s) => s.model);
  const measurements = useEditor((s) => s.measurements);
  const damagePins = useEditor((s) => s.damagePins);
  const surveyNotes = useEditor((s) => s.surveyNotes);
  const checklist = useEditor((s) => s.checklist);
  const customChecks = useEditor((s) => s.customChecks);
  const use = useEditor((s) => s.lastDiagnosis?.input.desiredUse ?? s.checkUse);
  const [notes, setNotes] = useState(surveyNotes);
  const [version, setVersion] = useState(0);
  const [checks, setChecks] = useState<ChecklistReportRow[]>([]);

  // 内見チェックの記録を、写真ごと報告書に載せられる形にする
  useEffect(() => {
    const why = new Map<string, string>();
    for (const c of COMMON_VIEWING) why.set(c.label, c.why);
    if (use) for (const c of USE_VIEWING[use] ?? []) why.set(c.label, c.why);
    for (const c of customChecks) why.set(c.label, '現場で足した項目');

    const rows = Object.entries(checklist).map(([label, e]) => ({
      label,
      why: why.get(label) ?? '',
      state: e.state,
      memo: e.memo,
      ids: e.photos,
    }));

    let alive = true;
    void Promise.all(rows.map((r) => getPhotos(r.ids))).then((all) => {
      if (!alive) return;
      setChecks(
        rows.map((r, i) => ({
          label: r.label,
          why: r.why,
          state: r.state,
          memo: r.memo,
          photos: (all[i] ?? []).filter((p): p is string => Boolean(p)),
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [checklist, customChecks, use]);

  const html = useMemo(
    () => renderSurveyReport(model, measurements, damagePins, notes, checks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, measurements, damagePins, checks, version],
  );

  const flagged = checks.filter((c) => c.state !== 'ok').length;

  return (
    <div className="fullpane">
      <h1 className="sr-only">現況調査報告書</h1>
      <div className="surveybar">
        <Link href="/app/editor" className="hb-btn hb-outline">間取りを直す</Link>
        <Link href="/app/checklist" className="hb-btn hb-outline">
          内見チェック{checks.length ? `(${checks.length}件${flagged ? ` / 要確認${flagged}` : ''})` : ''}
        </Link>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            useEditor.getState().setSurveyNotes(notes);
            setVersion((v) => v + 1);
          }}
          placeholder="所見(自由記述)。入力して枠の外に触れると反映されます"
          className="surveybar-notes"
        />
      </div>
      <div className="min-h-0 flex-1">
        <ReportFrame html={html} />
      </div>
    </div>
  );
}
