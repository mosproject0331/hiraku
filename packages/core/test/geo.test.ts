import { describe, expect, it } from 'vitest';
import {
  bearingToPlanHeading, lonLatToPixel, metersPerPixel, northHeadingInPlan,
  boundaryAreaM2, exteriorCamera, pixelToLonLat, planAreaM2, planToLonLat, solarNoon, solarPosition, sunTimes,
  type Site, type SpaceModel,
} from '../src/index';

const TOKYO = { lat: 35.6895, lon: 139.6917 };

describe('地図の座標', () => {
  it('経緯度とピクセルを往復できる', () => {
    const z = 18;
    const p = lonLatToPixel(TOKYO.lon, TOKYO.lat, z);
    const back = pixelToLonLat(p.x, p.y, z);
    expect(back.lon).toBeCloseTo(TOKYO.lon, 6);
    expect(back.lat).toBeCloseTo(TOKYO.lat, 6);
  });

  it('緯度が上がるほど、1ピクセルの実寸は小さくなる', () => {
    expect(metersPerPixel(0, 18)).toBeGreaterThan(metersPerPixel(60, 18));
    // 東京・ズーム18 で、おおむね 0.4〜0.5m/px
    const m = metersPerPixel(35.7, 18);
    expect(m).toBeGreaterThan(0.4);
    expect(m).toBeLessThan(0.5);
  });
});

describe('図面を土地に置く', () => {
  const site: Site = { address: '東京', lat: TOKYO.lat, lon: TOKYO.lon, anchorXMm: 0, anchorYMm: 0, rotationDeg: 0, zoom: 18 };

  it('回転0なら、図面の右が北', () => {
    const p = planToLonLat(site, 10000, 0); // 右へ10m
    expect(p.lat).toBeGreaterThan(site.lat); // 北へ動く
    expect(Math.abs(p.lon - site.lon)).toBeLessThan(1e-6);
  });

  it('回転90なら、図面の右が東', () => {
    const p = planToLonLat({ ...site, rotationDeg: 90 }, 10000, 0);
    expect(p.lon).toBeGreaterThan(site.lon);
    expect(Math.abs(p.lat - site.lat)).toBeLessThan(1e-6);
  });

  it('基準点をずらすと、その点が指定した緯度経度に来る', () => {
    const s2: Site = { ...site, anchorXMm: 5000, anchorYMm: 3000 };
    const at = planToLonLat(s2, 5000, 3000);
    expect(at.lat).toBeCloseTo(site.lat, 9);
    expect(at.lon).toBeCloseTo(site.lon, 9);
  });

  it('真北は、図面の向きに直せる', () => {
    expect(northHeadingInPlan({ ...site, rotationDeg: 0 })).toBe(0);
    expect(northHeadingInPlan({ ...site, rotationDeg: 90 })).toBe(270);
    expect(bearingToPlanHeading({ ...site, rotationDeg: 90 }, 90)).toBe(0);
  });
});

describe('太陽の位置', () => {
  it('夏至の正午、東京では70度より高い', () => {
    const noon = solarNoon(new Date('2026-06-21T03:00:00Z'), TOKYO.lat, TOKYO.lon);
    const s = solarPosition(noon, TOKYO.lat, TOKYO.lon);
    expect(s.altitudeDeg).toBeGreaterThan(70);
    expect(s.altitudeDeg).toBeLessThan(82);
    expect(s.azimuthDeg).toBeGreaterThan(150);
    expect(s.azimuthDeg).toBeLessThan(210); // ほぼ南
  });

  it('冬至の正午は、夏至よりずっと低い', () => {
    const summer = solarPosition(solarNoon(new Date('2026-06-21T03:00:00Z'), TOKYO.lat, TOKYO.lon), TOKYO.lat, TOKYO.lon);
    const winter = solarPosition(solarNoon(new Date('2026-12-21T03:00:00Z'), TOKYO.lat, TOKYO.lon), TOKYO.lat, TOKYO.lon);
    expect(winter.altitudeDeg).toBeLessThan(35);
    expect(summer.altitudeDeg - winter.altitudeDeg).toBeGreaterThan(40);
  });

  it('朝は東から、夕方は西から', () => {
    const day = '2026-09-23';
    const morning = solarPosition(new Date(`${day}T22:00:00Z`), TOKYO.lat, TOKYO.lon); // JST 翌7時
    const evening = solarPosition(new Date(`${day}T08:00:00Z`), TOKYO.lat, TOKYO.lon); // JST 17時
    expect(morning.azimuthDeg).toBeGreaterThan(60);
    expect(morning.azimuthDeg).toBeLessThan(130);
    expect(evening.azimuthDeg).toBeGreaterThan(230);
    expect(evening.azimuthDeg).toBeLessThan(300);
  });

  it('真夜中は地平線の下', () => {
    const s = solarPosition(new Date('2026-06-21T15:00:00Z'), TOKYO.lat, TOKYO.lon); // JST 深夜0時
    expect(s.altitudeDeg).toBeLessThan(0);
  });
});

describe('日の出と日の入り', () => {
  it('端末の時間帯に左右されない', () => {
    // 同じ瞬間を別の書き方で渡しても、同じ答えになる
    const a = sunTimes(new Date('2026-09-23T00:00:00Z'), TOKYO.lat, TOKYO.lon);
    const b = sunTimes(new Date('2026-09-23T09:00:00Z'), TOKYO.lat, TOKYO.lon);
    expect(a.noon.getTime()).toBe(b.noon.getTime());
    expect(a.sunrise!.getTime()).toBe(b.sunrise!.getTime());
  });

  it('南中は、その土地の正午に近い（東京はUTC+9)', () => {
    const t = sunTimes(new Date('2026-09-23T03:00:00Z'), TOKYO.lat, TOKYO.lon);
    // 東京の南中は UTC で 3時ごろ（＝JST 12時ごろ）
    const utcHour = t.noon.getUTCHours() + t.noon.getUTCMinutes() / 60;
    expect(utcHour).toBeGreaterThan(2.4);
    expect(utcHour).toBeLessThan(3.4);
  });

  it('夏は日が長く、冬は短い', () => {
    const s = sunTimes(new Date('2026-06-21T03:00:00Z'), TOKYO.lat, TOKYO.lon);
    const w = sunTimes(new Date('2026-12-21T03:00:00Z'), TOKYO.lat, TOKYO.lon);
    const len = (t: { sunrise: Date | null; sunset: Date | null }) =>
      t.sunrise && t.sunset ? (t.sunset.getTime() - t.sunrise.getTime()) / 3600000 : 0;
    expect(len(s)).toBeGreaterThan(13.5);
    expect(len(w)).toBeLessThan(11);
    expect(len(s) - len(w)).toBeGreaterThan(3);
  });

  it('日の出は南中より前、日の入りは後', () => {
    const t = sunTimes(new Date('2026-09-23T03:00:00Z'), TOKYO.lat, TOKYO.lon);
    expect(t.sunrise!.getTime()).toBeLessThan(t.noon.getTime());
    expect(t.sunset!.getTime()).toBeGreaterThan(t.noon.getTime());
  });
});

describe('外からの視点', () => {
  it('屋根の棟まで画面に入る距離をとる', () => {
    const m: SpaceModel = {
      id: 't',
      levels: [
        { id: 'L1', name: '1階', heightMm: 2400, nodes: [
          { id: 'n1', x: 0, y: 0, confidence: 'measured' },
          { id: 'n2', x: 8000, y: 0, confidence: 'measured' },
          { id: 'n3', x: 8000, y: 6000, confidence: 'measured' },
          { id: 'n4', x: 0, y: 6000, confidence: 'measured' },
        ], walls: [
          { id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'measured', structural: 'unknown' },
          { id: 'w2', a: 'n2', b: 'n3', thickness: 120, confidence: 'measured', structural: 'unknown' },
          { id: 'w3', a: 'n3', b: 'n4', thickness: 120, confidence: 'measured', structural: 'unknown' },
          { id: 'w4', a: 'n4', b: 'n1', thickness: 120, confidence: 'measured', structural: 'unknown' },
        ], openings: [], rooms: [] },
      ],
      roof: { shape: 'gable', pitchSun: 4, eaveMm: 600, ridge: 'x', material: 'kawara', exposeCeiling: false },
      moduleMm: 910, scaleFactor: 1, version: 1,
    };
    const cam = exteriorCamera(m)!;
    expect(cam).toBeTruthy();
    // 目線は水平（垂直線が倒れない）
    expect(cam.target[1]).toBeCloseTo(cam.position[1], 6);
    // 建物の外に立っている
    const away = Math.hypot(cam.position[0] - 4, cam.position[2] - 3);
    expect(away).toBeGreaterThan(5);

    // 棟の高さが、ずらしたレンズの画角に入るか
    const topY = 2.4 + ((6 / 2 + 0.6) * 0.4) + 0.3 + 0.12;
    const tanHalf = Math.tan((cam.fovDeg * Math.PI) / 360);
    const dNear = away - 3; // いちばん手前の面まで
    const visibleTop = cam.position[1] + dNear * tanHalf * (1 + 0.32 * 0.55);
    expect(visibleTop).toBeGreaterThan(topY);
  });

  it('階が増えると、その分だけ下がる', () => {
    const one: SpaceModel = {
      id: 't', moduleMm: 910, scaleFactor: 1, version: 1,
      levels: [{ id: 'L1', name: '1階', heightMm: 2400, nodes: [
        { id: 'n1', x: 0, y: 0, confidence: 'measured' },
        { id: 'n2', x: 6000, y: 0, confidence: 'measured' },
        { id: 'n3', x: 6000, y: 5000, confidence: 'measured' },
      ], walls: [
        { id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'measured', structural: 'unknown' },
        { id: 'w2', a: 'n2', b: 'n3', thickness: 120, confidence: 'measured', structural: 'unknown' },
      ], openings: [], rooms: [] }],
    };
    const two: SpaceModel = { ...one, levels: [one.levels[0]!, { ...one.levels[0]!, id: 'L2', name: '2階' }] };
    const d1 = exteriorCamera(one)!;
    const d2 = exteriorCamera(two)!;
    const dist = (c: typeof d1) => Math.hypot(c.position[0] - 3, c.position[2] - 2.5);
    expect(dist(d2)).toBeGreaterThan(dist(d1));
  });
});

describe('敷地の面積', () => {
  it('緯度経度の四角形から、およその面積が出る', () => {
    // 東京あたりで、およそ 20m × 15m
    const dLat = 15 / 111320;
    const dLon = 20 / (111320 * Math.cos((TOKYO.lat * Math.PI) / 180));
    const a = boundaryAreaM2([
      { lat: TOKYO.lat, lon: TOKYO.lon },
      { lat: TOKYO.lat, lon: TOKYO.lon + dLon },
      { lat: TOKYO.lat + dLat, lon: TOKYO.lon + dLon },
      { lat: TOKYO.lat + dLat, lon: TOKYO.lon },
    ]);
    expect(a).toBeGreaterThan(295);
    expect(a).toBeLessThan(305);
  });

  it('点が2つ以下なら0', () => {
    expect(boundaryAreaM2([{ lat: 35, lon: 139 }])).toBe(0);
  });

  it('図面の輪郭からも面積が出る', () => {
    expect(planAreaM2([{ x: 0, y: 0 }, { x: 3640, y: 0 }, { x: 3640, y: 2730 }, { x: 0, y: 2730 }]))
      .toBeCloseTo(9.94, 2);
  });
});
