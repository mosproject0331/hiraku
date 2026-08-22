'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { renderSurveyReport } from '@hiraku/report';
import ReportFrame from '@/components/ReportFrame';
import { useEditor } from '@/lib/store';

export default function SurveyPage() {
  const model = useEditor((s) => s.model);
  const measurements = useEditor((s) => s.measurements);
  const damagePins = useEditor((s) => s.damagePins);
  const surveyNotes = useEditor((s) => s.surveyNotes);
  const [notes, setNotes] = useState(surveyNotes);
  const [version, setVersion] = useState(0);

  const html = useMemo(
    () => renderSurveyReport(model, measurements, damagePins, notes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, measurements, damagePins, version],
  );

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Link href="/app/editor" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          ← エディタへ戻る
        </Link>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            useEditor.getState().setSurveyNotes(notes);
            setVersion((v) => v + 1);
          }}
          placeholder="所見(自由記述)。入力して枠の外をクリックすると反映されます"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1">
        <ReportFrame html={html} />
      </div>
    </div>
  );
}
