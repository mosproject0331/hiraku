import {
  roomAreaM2,
  roomWallAreaM2,
  takeoff,
  validateOps,
  type OpIssue,
  type RenovationOp,
  type SpaceModel,
} from '@hiraku/core';
import { DIY_CLASS_LABEL, WORK_ITEM_BY_ID, WORK_ITEMS, type DiyClass, type WorkItem } from './data/work-items';

export { DIY_CLASS_LABEL, WORK_ITEMS, WORK_ITEM_BY_ID };
export type { DiyClass, WorkItem };

export interface EstimateLine {
  itemId: string;
  name: string;
  category: string;
  qty: number;
  unit: WorkItem['unit'];
  lowYen: number;
  highYen: number;
  diyClass: DiyClass;
  requiredLicense?: string;
  permitNote?: string;
  steps: string[];
  structuralWarning?: string;
  note?: string;
}

export interface PlanEstimate {
  lines: EstimateLine[];
  /** (a) DIY材料費レンジ(diy / diy_hard) */
  diyMaterial: { lowYen: number; highYen: number };
  /** (b) 有資格・専門工事: 材料費のみ参考+施工費は要見積 */
  proMaterial: { lowYen: number; highYen: number };
  /** (c) 許可・届出関連フラグ */
  permitFlags: string[];
  issues: OpIssue[];
}

const round100 = (n: number) => Math.round(n / 100) * 100;

function line(
  itemId: string,
  qty: number,
  extras?: Partial<Pick<EstimateLine, 'structuralWarning' | 'note'>>,
): EstimateLine {
  const w = WORK_ITEM_BY_ID.get(itemId);
  if (!w) throw new Error('unknown work item: ' + itemId);
  const q = Math.max(qty, 0);
  return {
    itemId: w.id,
    name: w.name,
    category: w.category,
    qty: Math.round(q * 100) / 100,
    unit: w.unit,
    lowYen: round100(w.materialUnitPrice.low * q),
    highYen: round100(w.materialUnitPrice.high * q),
    diyClass: w.diyClass,
    requiredLicense: w.requiredLicense,
    permitNote: w.permitNote,
    steps: w.steps,
    ...extras,
  };
}

const FLOOR_FINISH: Record<string, string> = {
  flooring: 'flooring',
  cushion_floor: 'cushion_floor',
  tatami_omote: 'tatami_omote',
};
const WALL_FINISH: Record<string, string> = {
  cloth: 'cloth',
  shikkui_diy: 'shikkui_diy',
  paint: 'paint',
};
const CEILING_FINISH: Record<string, string> = {
  ceiling_paint: 'ceiling_paint',
  ceiling_board: 'ceiling_board',
};
const WATER_UNIT: Record<string, string> = {
  kitchen: 'kitchen',
  toilet: 'toilet',
  bath: 'bath',
  sink: 'senmen',
};

/** Op列から見積を組み立てる。§2-5: 総額の一本値は出さない。常にレンジ */
export function estimatePlan(model: SpaceModel, ops: RenovationOp[]): PlanEstimate {
  const issues = validateOps(model, ops);
  const warnByIndex = new Map<number, string>();
  for (const i of issues) if (i.level === 'warning') warnByIndex.set(i.index, i.message);
  const errIndex = new Set(issues.filter((i) => i.level === 'error').map((i) => i.index));

  const lines: EstimateLine[] = [];
  const t = takeoff(model);

  ops.forEach((op, idx) => {
    if (errIndex.has(idx)) return;
    const warn = warnByIndex.get(idx);
    switch (op.op) {
      case 'remove_partition': {
        const w = t.walls.find((x) => x.wallId === op.wallId);
        lines.push(line('demo-partition', w?.areaM2 ?? 0, { structuralWarning: warn }));
        break;
      }
      case 'add_partition': {
        const lenM = Math.hypot(op.a.x - op.b.x, op.a.y - op.b.y) / 1000;
        const h = (model.levels[0]?.heightMm ?? 2400) / 1000;
        lines.push(line('carp-partition', Math.round(lenM * h * 100) / 100));
        break;
      }
      case 'add_opening':
        lines.push(line('carp-opening', 1, { structuralWarning: warn }));
        break;
      case 'close_opening':
        lines.push(line('carp-close-opening', 1));
        break;
      case 'change_floor': {
        const item = FLOOR_FINISH[op.finishId];
        if (!item) break;
        const area = roomAreaM2(model, op.roomId);
        const qty = op.finishId === 'tatami_omote' ? Math.ceil(area / 1.62) : area;
        lines.push(line(item, qty));
        break;
      }
      case 'change_wall_finish': {
        const item = WALL_FINISH[op.finishId];
        if (!item) break;
        lines.push(line(item, roomWallAreaM2(model, op.roomId)));
        break;
      }
      case 'change_ceiling': {
        const item = CEILING_FINISH[op.finishId];
        if (!item) break;
        lines.push(line(item, roomAreaM2(model, op.roomId)));
        break;
      }
      case 'add_water_unit': {
        const item = WATER_UNIT[op.unit];
        if (!item) break;
        lines.push(line(item, 1, { note: '給排水経路: ' + op.routeNote }));
        lines.push(line('haisui-koshin', 1, { note: '経路により変動。指定工事店の見積が必要' }));
        break;
      }
      case 'insulate': {
        if (op.target === 'window_inner') {
          lines.push(line('window_inner', 1));
        } else {
          const area = op.roomId ? roomAreaM2(model, op.roomId) : t.totalFloorM2;
          lines.push(line(op.target === 'floor' ? 'insulate-floor' : 'insulate-ceiling', area));
        }
        break;
      }
      case 'electrical': {
        const item = op.work === 'add_outlet' ? 'outlet' : op.work === 'add_circuit' ? 'circuit' : 'lighting_diy';
        lines.push(line(item, op.count));
        break;
      }
    }
  });

  const diyLines = lines.filter((l) => l.diyClass === 'diy' || l.diyClass === 'diy_hard');
  const proLines = lines.filter((l) => l.diyClass === 'licensed' || l.diyClass === 'pro_recommended');
  const permitFlags = [
    ...new Set(
      lines
        .flatMap((l) => [l.permitNote, l.requiredLicense ? `${l.name}: ${l.requiredLicense}` : undefined])
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  return {
    lines,
    diyMaterial: {
      lowYen: diyLines.reduce((s, l) => s + l.lowYen, 0),
      highYen: diyLines.reduce((s, l) => s + l.highYen, 0),
    },
    proMaterial: {
      lowYen: proLines.reduce((s, l) => s + l.lowYen, 0),
      highYen: proLines.reduce((s, l) => s + l.highYen, 0),
    },
    permitFlags,
    issues,
  };
}
