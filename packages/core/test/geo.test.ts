import { describe, expect, it } from 'vitest';
import {
  bearingToPlanHeading, lonLatToPixel, metersPerPixel, northHeadingInPlan,
  pixelToLonLat, planToLonLat, solarNoon, solarPosition, sunTimes, type Site,
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
