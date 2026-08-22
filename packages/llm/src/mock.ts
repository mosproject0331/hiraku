import { deserialize, detectRooms, type RenovationOp, type SpaceModel } from '@hiraku/core';

export interface HearingPlan {
  name: string;
  intent: string;
  ops: RenovationOp[];
}

export interface HearingTurn {
  reply?: string;
  plans?: HearingPlan[];
}

/** 決定的なモック: 間取りモデルの実データからOp列を組む */
export function mockHearingPlans(model: SpaceModel): HearingPlan[] {
  const level = model.levels[0];
  if (!level) return [];
  const rooms = detectRooms(level);
  const biggest = rooms[0];
  const second = rooms[1];
  // 2部屋にまたがる内壁(構造不明はwarning付きで通る。suspectedは避ける)
  const innerWall = level.walls.find((w) => w.structural === 'unknown');
  const anyWindowless = rooms[rooms.length - 1];

  const minimal: HearingPlan = {
    name: '最小案',
    intent: 'まず使い始めることを優先し、仕上げの更新と照明で空気を変える案',
    ops: [
      ...(biggest ? [{ op: 'change_floor', roomId: biggest.id, finishId: 'flooring' } as RenovationOp] : []),
      ...(biggest ? [{ op: 'change_wall_finish', roomId: biggest.id, finishId: 'shikkui_diy' } as RenovationOp] : []),
      { op: 'electrical', work: 'lighting_diy', count: 3 },
    ],
  };
  const standard: HearingPlan = {
    name: '標準案',
    intent: '間仕切りを1枚抜いて大きな一室をつくり、断熱も一緒に入れる案',
    ops: [
      ...(innerWall ? [{ op: 'remove_partition', wallId: innerWall.id } as RenovationOp] : []),
      ...(biggest ? [{ op: 'change_floor', roomId: biggest.id, finishId: 'flooring' } as RenovationOp] : []),
      ...(second ? [{ op: 'change_floor', roomId: second.id, finishId: 'flooring' } as RenovationOp] : []),
      { op: 'insulate', target: 'window_inner' },
      { op: 'electrical', work: 'add_outlet', count: 4 },
    ],
  };
  const ambitious: HearingPlan = {
    name: '攻め案',
    intent: '水回りを足して長時間滞在できる場にする案(給排水は専門工事)',
    ops: [
      ...(innerWall ? [{ op: 'remove_partition', wallId: innerWall.id } as RenovationOp] : []),
      ...(biggest
        ? [{ op: 'add_water_unit', roomId: biggest.id, unit: 'kitchen', routeNote: '既存の水回りに最も近い壁沿いを想定(現地確認要)' } as RenovationOp]
        : []),
      ...(anyWindowless ? [{ op: 'change_floor', roomId: anyWindowless.id, finishId: 'cushion_floor' } as RenovationOp] : []),
      { op: 'insulate', target: 'floor' },
      { op: 'electrical', work: 'add_circuit', count: 2 },
    ],
  };
  return [minimal, standard, ambitious];
}

/** 会話モック: 1往復目は聞き返し、2往復目以降で3案を返す */
export function mockHearingTurn(modelJson: string, userMessages: string[]): HearingTurn {
  if (userMessages.length <= 1) {
    return {
      reply:
        'ありがとうございます。2つだけ教えてください。(1) その場所で一番やりたい過ごし方は何ですか。(2) 自分たちで手を動かしたい気持ちはどれくらいありますか(全部おまかせ〜できるだけ自分たちで)。',
    };
  }
  const model = deserialize(modelJson);
  return {
    reply: '要望を踏まえて、方向性の違う3案をつくりました。金額はどれも「参考値・要検証」のレンジ表示です。',
    plans: mockHearingPlans(model),
  };
}

/** レポートQ&Aのモック応答（サーバー無しでも動く） */
export function mockReportQA(question: string): string {
  return (
    'この画面の内容から言える範囲でお答えします。' +
    '個別の法解釈や安全性の断定はこのツールでは判断できないため、レポートの「確認先」に相談してください。' +
    '(モック応答: ご質問「' + question.slice(0, 60) + '」)'
  );
}
