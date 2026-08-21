import { deserialize, validateOps, type RenovationOp } from '@hiraku/core';
import { mockHearingPlans, mockHearingTurn, type HearingPlan, type HearingTurn } from './mock';
import { HEARING_SYSTEM } from './prompts/hearing';
import { EXPLAINER_SYSTEM } from './prompts/explainer';

export { mockHearingPlans, mockHearingTurn, HEARING_SYSTEM, EXPLAINER_SYSTEM };
export type { HearingPlan, HearingTurn };

export type LlmMode = 'mock' | 'live';

export function currentMode(): LlmMode {
  return process.env.LLM_MODE === 'live' && process.env.ANTHROPIC_API_KEY ? 'live' : 'mock';
}

/**
 * 改修ヒアリングの1ターン。live時はAnthropic APIで3案JSONを生成し、
 * スキーマ・参照整合の検証に失敗したら1リトライ→モックにフォールバック(§5-M6)。
 */
export async function hearingTurn(modelJson: string, userMessages: string[]): Promise<HearingTurn> {
  if (currentMode() === 'mock') return mockHearingTurn(modelJson, userMessages);
  try {
    return await liveHearing(modelJson, userMessages);
  } catch {
    return mockHearingTurn(modelJson, userMessages);
  }
}

async function liveHearing(modelJson: string, userMessages: string[]): Promise<HearingTurn> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { z } = await import('zod');
  const client = new Anthropic();

  const XY = z.object({ x: z.number(), y: z.number() });
  const OpSchema = z.union([
    z.object({ op: z.literal('remove_partition'), wallId: z.string() }),
    z.object({ op: z.literal('add_partition'), a: XY, b: XY }),
    z.object({
      op: z.literal('add_opening'), wallId: z.string(), offset: z.number(), width: z.number(),
      height: z.number(), sillHeight: z.number(), kind: z.enum(['door', 'window', 'entrance', 'other']),
    }),
    z.object({ op: z.literal('close_opening'), openingId: z.string() }),
    z.object({ op: z.enum(['change_floor', 'change_wall_finish', 'change_ceiling']), roomId: z.string(), finishId: z.string() }),
    z.object({ op: z.literal('add_water_unit'), roomId: z.string(), unit: z.enum(['kitchen', 'toilet', 'bath', 'sink']), routeNote: z.string() }),
    z.object({ op: z.literal('insulate'), target: z.enum(['floor', 'ceiling', 'window_inner']), roomId: z.string().optional() }),
    z.object({ op: z.literal('electrical'), work: z.enum(['add_outlet', 'add_circuit', 'lighting_diy']), count: z.number().int().min(1), roomId: z.string().optional() }),
  ]);
  const ResultSchema = z.object({
    reply: z.string(),
    plans: z.array(z.object({ name: z.string(), intent: z.string(), ops: z.array(OpSchema) })).length(3).optional(),
  });

  const model = deserialize(modelJson);
  const ask = async () => {
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: HEARING_SYSTEM,
      messages: [
        {
          role: 'user' as const,
          content:
            '間取りモデル(JSON):\n' + modelJson.slice(0, 20000) +
            '\n\nこれまでのユーザー発言:\n' + userMessages.map((m, i) => `${i + 1}. ${m}`).join('\n') +
            '\n\n次のJSONだけを出力: {"reply": string, "plans"?: [{name,intent,ops}] }' +
            '\nユーザー発言が2件以上なら必ずplans(3案)を含める。',
        },
      ],
    });
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = ResultSchema.parse(JSON.parse(jsonText));
    if (parsed.plans) {
      for (const p of parsed.plans) {
        const errs = validateOps(model, p.ops as RenovationOp[]).filter((i) => i.level === 'error');
        if (errs.length) throw new Error('op validation failed: ' + errs[0]!.message);
      }
    }
    return parsed as HearingTurn;
  };
  try {
    return await ask();
  } catch {
    return await ask(); // 1リトライ
  }
}

/** レポートQ&A(M7)。mockは定型応答 */
export async function reportQA(question: string, context: string): Promise<string> {
  if (currentMode() === 'mock') {
    return (
      'この画面の内容から言える範囲でお答えします。' +
      '個別の法解釈や安全性の断定はこのツールでは判断できないため、レポートの「確認先」に相談してください。' +
      '(モック応答: ご質問「' + question.slice(0, 60) + '」)'
    );
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1500,
    system:
      'あなたは空き家活用支援ツールの案内役。与えられたコンテキストの範囲でだけ答え、範囲外は「このツールでは判断できない」と答える。断定語を避け、数値や条番号を新規に作らない。',
    messages: [{ role: 'user', content: 'コンテキスト:\n' + context.slice(0, 30000) + '\n\n質問: ' + question }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}

/** ルール出力の平易化(§8 explainer)。mockは入力をそのまま返す(既に平易文のため) */
export async function explain(structuredText: string): Promise<string> {
  if (currentMode() === 'mock') return structuredText;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: EXPLAINER_SYSTEM,
    messages: [{ role: 'user', content: structuredText }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? structuredText;
}
