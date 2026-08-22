/**
 * 敷地の座標と、太陽の位置。
 *
 * 図面は「この家のなか」の話しかしないが、実際の建物は土地の上に、
 * ある向きで建っている。方位が決まれば、光がどこから入るかが決まる。
 * ここでは、地図の座標系と図面の座標系をつなぐ計算だけを持つ。
 */

/** 敷地。図面をどこに、どの向きで置くか */
export interface Site {
  /** 入力した住所（表示用） */
  address: string;
  /** 下の基準点が乗っている場所 */
  lat: number;
  lon: number;
  /** 緯度経度に対応する図面上の点(mm)。既定は図面の中心 */
  anchorXMm: number;
  anchorYMm: number;
  /**
   * 図面の +x 軸が向いている方位（真北から時計回りの度）。
   * 0 なら図面の右が北。90 なら図面の右が東。
   */
  rotationDeg: number;
  /** 地図を見ていた縮尺（航空写真の取り直しに使う） */
  zoom: number;
  /** どこから引いた住所か */
  source?: string;
  /** いつ決めたか */
  at?: string;
}

/** 地球の半径から来る、赤道でのメートル/ピクセル（タイル256px基準） */
const EQUATOR_MPP = 156543.03392804097;

/** ズーム z・緯度 lat での、1ピクセルあたりのメートル */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** 経緯度 → 世界ピクセル座標（タイル256px基準） */
export function lonLatToPixel(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/** 世界ピクセル座標 → 経緯度 */
export function pixelToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = 256 * Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const t = Math.PI - (2 * Math.PI * y) / n;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(t));
  return { lon, lat };
}

/** 図面の点(mm)を、緯度経度に置く */
export function planToLonLat(site: Site, xMm: number, yMm: number): { lon: number; lat: number } {
  // 図面の +x が方位 rotationDeg を向いている。+y はその90度右
  const r = (site.rotationDeg * Math.PI) / 180;
  const dx = xMm - (site.anchorXMm ?? 0);
  const dy = yMm - (site.anchorYMm ?? 0);
  const east = (dx * Math.sin(r) + dy * Math.sin(r + Math.PI / 2)) / 1000;
  const north = (dx * Math.cos(r) + dy * Math.cos(r + Math.PI / 2)) / 1000;
  const dLat = north / 111320;
  const dLon = east / (111320 * Math.cos((site.lat * Math.PI) / 180));
  return { lat: site.lat + dLat, lon: site.lon + dLon };
}

/**
 * 真北が、図面のなかでどちらを向いているか。
 * 図面の向きの決まり（0=右, 90=下, 時計回り）で返す。
 */
export function northHeadingInPlan(site: Site): number {
  return (360 - (site.rotationDeg % 360)) % 360;
}

/** 方位（真北から時計回りの度）を、図面の向きに直す */
export function bearingToPlanHeading(site: Site, bearingDeg: number): number {
  return (((bearingDeg - site.rotationDeg) % 360) + 360) % 360;
}

/* ────────── 太陽の位置 ────────── */

export interface SolarPosition {
  /** 地平線からの角度(度)。負なら日の入りのあと */
  altitudeDeg: number;
  /** 方位(真北から時計回りの度)。太陽が「ある」向き */
  azimuthDeg: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * ある日時・ある土地から見た太陽の位置。
 * NOAA の式をそのまま使う。誤差は実用の範囲で1分角ほど。
 *
 * @param when 日時（この端末の時刻でよい。内部でUTCに直す）
 */
export function solarPosition(when: Date, lat: number, lon: number): SolarPosition {
  const ms = when.getTime();
  // ユリウス日
  const jd = ms / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;

  const geomMeanLong = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const geomMeanAnom = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccent = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const sunEqCtr =
    Math.sin(rad(geomMeanAnom)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(rad(2 * geomMeanAnom)) * (0.019993 - 0.000101 * jc) +
    Math.sin(rad(3 * geomMeanAnom)) * 0.000289;
  const sunTrueLong = geomMeanLong + sunEqCtr;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * jc));
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(rad(125.04 - 1934.136 * jc));
  const declin = deg(Math.asin(Math.sin(rad(obliqCorr)) * Math.sin(rad(sunAppLong))));

  const varY = Math.tan(rad(obliqCorr / 2)) ** 2;
  const eqOfTime =
    4 *
    deg(
      varY * Math.sin(2 * rad(geomMeanLong)) -
        2 * eccent * Math.sin(rad(geomMeanAnom)) +
        4 * eccent * varY * Math.sin(rad(geomMeanAnom)) * Math.cos(2 * rad(geomMeanLong)) -
        0.5 * varY * varY * Math.sin(4 * rad(geomMeanLong)) -
        1.25 * eccent * eccent * Math.sin(2 * rad(geomMeanAnom)),
    );

  // その日の、真夜中からの分
  const utcMinutes = (ms / 60000) % 1440;
  const trueSolarTime = (utcMinutes + eqOfTime + 4 * lon + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;

  const latR = rad(lat);
  const declR = rad(declin);
  const haR = rad(hourAngle);
  const cosZenith =
    Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const zenith = deg(Math.acos(Math.max(-1, Math.min(1, cosZenith))));
  const altitude = 90 - zenith;

  let azimuth: number;
  const denom = Math.cos(latR) * Math.sin(rad(zenith));
  if (Math.abs(denom) > 1e-9) {
    const c = (Math.sin(latR) * Math.cos(rad(zenith)) - Math.sin(declR)) / denom;
    const a = deg(Math.acos(Math.max(-1, Math.min(1, c))));
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  } else {
    azimuth = lat > 0 ? 180 : 0;
  }

  return { altitudeDeg: altitude, azimuthDeg: azimuth };
}

/** その日、太陽がいちばん高くなる時刻（地方時のずれを含む） */
export function solarNoon(when: Date, lat: number, lon: number): Date {
  // 15分刻みで一番高いところを探し、そのまわりを1分刻みで詰める
  const day = new Date(when);
  day.setHours(0, 0, 0, 0);
  let best = day;
  let bestAlt = -90;
  for (let m = 0; m < 1440; m += 15) {
    const t = new Date(day.getTime() + m * 60000);
    const a = solarPosition(t, lat, lon).altitudeDeg;
    if (a > bestAlt) {
      bestAlt = a;
      best = t;
    }
  }
  for (let m = -15; m <= 15; m++) {
    const t = new Date(best.getTime() + m * 60000);
    const a = solarPosition(t, lat, lon).altitudeDeg;
    if (a > bestAlt) {
      bestAlt = a;
      best = t;
    }
  }
  return best;
}

export interface SunTimes {
  sunrise: Date | null;
  noon: Date;
  sunset: Date | null;
}

/**
 * その日の日の出・南中・日の入り。
 * 光の話は季節でまるごと変わるので、時刻を決め打ちにしない。
 */
export function sunTimes(when: Date, lat: number, lon: number): SunTimes {
  const day = new Date(when);
  day.setHours(0, 0, 0, 0);
  const alt = (m: number) => solarPosition(new Date(day.getTime() + m * 60000), lat, lon).altitudeDeg;
  const noon = solarNoon(when, lat, lon);
  const noonM = Math.round((noon.getTime() - day.getTime()) / 60000);

  /** from から step 方向へ、地平線をまたぐところを探す */
  const cross = (from: number, step: number): Date | null => {
    let prev = alt(from);
    for (let m = from + step; m >= 0 && m <= 1440; m += step) {
      const cur = alt(m);
      if (prev > 0 && cur <= 0) {
        // 1分刻みで詰める
        for (let k = m - step; step > 0 ? k <= m : k >= m; k += step > 0 ? 1 : -1) {
          if (alt(k) <= 0) return new Date(day.getTime() + k * 60000);
        }
        return new Date(day.getTime() + m * 60000);
      }
      prev = cur;
    }
    return null;
  };

  return {
    sunrise: alt(noonM) > 0 ? cross(noonM, -5) : null,
    noon,
    sunset: alt(noonM) > 0 ? cross(noonM, 5) : null,
  };
}
