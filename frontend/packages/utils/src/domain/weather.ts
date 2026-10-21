// frontend/packages/utils/src/domain/weather.ts
//
// 和风天气「双代」归一器 —— 把 v7(旧)与 v1(新)两种上游结构收敛成同一套扁平视图模型。
//
// 背景:后端 `internal/infra/qweather` 同时挂着两代接口 ——
//   - 新(v1):/weather/v1/current|hourly|daily —— 数值 + 嵌套对象,路径参数纬度在前
//   - 旧(v7):/v7/ocean/tide、/v7/indices/1d —— 字符串 + 扁平字段
// 潮汐与生活指数尚无新版,故 /weather/full 是「混代」的。
//
// 前端不直接吃上游结构:统一经本模块归一,输出仍是「字符串 + 扁平字段」的视图模型,
// 于是 UI 组件与 AI 分析 payload(/v2/llm/weather-analysis 的 weather_data)契约不变。
//
// 归一口径(v1 → 视图模型):
//   温度/体感/降水/气压/露点  → 数值字符串(最多 1 位小数)
//   humidity / cloudCover    → [0,1] 比例 × 100,转百分比字符串
//   wind.direction.compass   → 16 方位代码 → 中文风向
//   wind.speed               → m/s → km/h(旧视图模型口径)
//   visibility               → m → km
//   astro.moonPhase          → "waxing-gibbous" → "盈凸月"
//   daily                    → 拆 daytime / nighttime 两段,fxDate 取当地日期
//   current                  → 无观测时间字段,obsTime 留空(UI 需容错)
//
// 双代共存是过渡期的客观现实:后端两仓(Server-Py / Server-Go)各自上线时间不同,
// 所以每一块都按「特征识别」逐条归一 —— 同一数组里混着两代条目也能正确处理。

import type {
  FishingIndexData,
  TideData,
  TideTableItem,
  WeatherDay,
  WeatherFullSnapshot,
  WeatherHourly,
  WeatherIndex,
  WeatherNow,
} from '@readinglist/types';

// ── 基础取值 ───────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const asRecord = (input: unknown): Rec | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Rec)
    : null;

const asArray = (input: unknown): unknown[] =>
  Array.isArray(input) ? input : [];

const numOf = (input: unknown): number | undefined =>
  typeof input === 'number' && Number.isFinite(input) ? input : undefined;

const strOf = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  return '';
};

/** 数值 → 展示字符串:最多 1 位小数,去掉尾随 0(8.13 → "8.1",29.0 → "29") */
const fmtNum = (value: number | undefined, digits = 1): string => {
  if (value === undefined) return '';
  const fixed = value.toFixed(digits);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
};

/** 取「带单位的数值」对象里的 value */
const measure = (input: unknown): number | undefined => {
  const rec = asRecord(input);
  return rec ? numOf(rec.value) : undefined;
};

const unitOf = (input: unknown): string => {
  const rec = asRecord(input);
  return rec ? strOf(rec.unit) : '';
};

/** [0,1] 比例 → 百分比数值 */
const ratioToPercent = (ratio: number | undefined): number | undefined =>
  ratio === undefined ? undefined : Math.round(ratio * 100);

/** 风速统一到 km/h(v1 默认 m/s) */
const toKmh = (value: number | undefined, unit: string): number | undefined => {
  if (value === undefined) return undefined;
  const u = unit.toLowerCase();
  if (u.includes('km/h')) return value;
  if (u.includes('mph')) return value * 1.609344;
  return value * 3.6;
};

/** 能见度统一到 km(v1 默认 m) */
const toKm = (value: number | undefined, unit: string): number | undefined => {
  if (value === undefined) return undefined;
  const u = unit.toLowerCase();
  if (u.includes('km')) return value;
  return value / 1000;
};

// ── 方位 / 月相 ────────────────────────────────────────────────────────────

const WIND_COMPASS_CN: Record<string, string> = {
  n: '北风',
  nne: '北偏东北风',
  ne: '东北风',
  ene: '东偏东北风',
  e: '东风',
  ese: '东偏东南风',
  se: '东南风',
  sse: '南偏东南风',
  s: '南风',
  ssw: '南偏西南风',
  sw: '西南风',
  wsw: '西偏西南风',
  w: '西风',
  wnw: '西偏西北风',
  nw: '西北风',
  nnw: '北偏西北风',
  none: '无持续风向',
  vrb: '风向不定',
};

const COMPASS_16 = [
  'n',
  'nne',
  'ne',
  'ene',
  'e',
  'ese',
  'se',
  'sse',
  's',
  'ssw',
  'sw',
  'wsw',
  'w',
  'wnw',
  'nw',
  'nnw',
];

/** 方位角 → 16 方位代码(每 22.5° 一档) */
const compassFromDegree = (degree: number): string => {
  const normalized = ((degree % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_16[index] ?? 'n';
};

/**
 * 16 方位代码 → 中文风向。
 * 旧代给的本来就是中文(如「西风」),此时原样返回。
 */
export const windCompassToChinese = (
  compass?: string,
  degree?: number,
): string => {
  const code = (compass ?? '').trim().toLowerCase();
  if (code && WIND_COMPASS_CN[code]) return WIND_COMPASS_CN[code] ?? '';
  if (degree !== undefined && Number.isFinite(degree)) {
    return WIND_COMPASS_CN[compassFromDegree(degree)] ?? '';
  }
  return '';
};

const MOON_PHASE_CN: Record<string, string> = {
  'new-moon': '新月',
  'waxing-crescent': '蛾眉月',
  'first-quarter': '上弦月',
  'waxing-gibbous': '盈凸月',
  'full-moon': '满月',
  'waning-gibbous': '亏凸月',
  'last-quarter': '下弦月',
  'waning-crescent': '残月',
};

/** 月相代码 → 中文;旧代给中文时原样返回 */
export const moonPhaseToChinese = (phase?: string): string => {
  const code = (phase ?? '').trim();
  if (!code) return '';
  return MOON_PHASE_CN[code.toLowerCase()] ?? code;
};

// ── 代际识别 ───────────────────────────────────────────────────────────────

/** v1 实时块:嵌套数值 + condition;旧代是扁平字符串字段 */
const isV1Current = (rec: Rec): boolean =>
  rec.temperature !== undefined ||
  rec.condition !== undefined ||
  rec.cloudCover !== undefined ||
  (rec.wind !== undefined && rec.wind !== null);

/** v1 逐时条目 */
const isV1Hour = (rec: Rec): boolean =>
  rec.forecastTime !== undefined ||
  rec.temperature !== undefined ||
  rec.condition !== undefined;

/** v1 每日条目 */
const isV1Day = (rec: Rec): boolean =>
  rec.daytime !== undefined ||
  rec.nighttime !== undefined ||
  rec.astro !== undefined ||
  rec.forecastStartTime !== undefined;

// ── 实时天气 ───────────────────────────────────────────────────────────────

/** 旧代扁平值:数值 ≤ 1 视作比例(新接口口径),字符串原样保留 */
const legacyPercent = (input: unknown): string => {
  if (typeof input === 'string') return input;
  const n = numOf(input);
  if (n === undefined) return '';
  return String(n <= 1 ? Math.round(n * 100) : Math.round(n));
};

const legacyNow = (rec: Rec): WeatherNow => ({
  obsTime: strOf(rec.obsTime),
  temp: strOf(rec.temp),
  feelsLike: strOf(rec.feelsLike),
  icon: strOf(rec.icon),
  text: strOf(rec.text),
  wind360: strOf(rec.wind360),
  windDir: strOf(rec.windDir),
  windScale: strOf(rec.windScale),
  windSpeed: strOf(rec.windSpeed),
  humidity: legacyPercent(rec.humidity),
  precip: strOf(rec.precip),
  pressure: strOf(rec.pressure),
  vis: strOf(rec.vis),
  cloud: legacyPercent(rec.cloud),
  dew: strOf(rec.dew),
});

const v1Now = (rec: Rec): WeatherNow => {
  const condition = asRecord(rec.condition);
  const wind = asRecord(rec.wind);
  const direction = asRecord(wind?.direction);
  const speed = asRecord(wind?.speed);
  const precipitation = asRecord(rec.precipitation);
  const amount = asRecord(precipitation?.amount);
  const visibility = rec.visibility;

  return {
    // v1 payload 无观测时间字段 —— 留空,UI 自行容错
    obsTime: '',
    temp: fmtNum(measure(rec.temperature)),
    feelsLike: fmtNum(measure(rec.feelsLike)),
    icon: strOf(condition?.code),
    text: strOf(condition?.text),
    wind360: strOf(direction?.degree),
    windDir: windCompassToChinese(
      strOf(direction?.compass),
      numOf(direction?.degree),
    ),
    windScale: strOf(wind?.scale),
    windSpeed: fmtNum(toKmh(numOf(speed?.value), unitOf(speed))),
    humidity: fmtNum(ratioToPercent(numOf(rec.humidity))),
    precip: fmtNum(numOf(amount?.value)),
    pressure: fmtNum(measure(rec.pressure)),
    vis: fmtNum(toKm(measure(visibility), unitOf(visibility))),
    cloud: fmtNum(ratioToPercent(numOf(rec.cloudCover))),
    dew: fmtNum(measure(rec.dewPoint)),
  };
};

/**
 * 归一实时天气块。
 *
 * 兼容两种入参:
 *   - v1:`{ condition, temperature, wind, ... }`
 *   - 旧代包装层:`{ code, updateTime, now: { temp, ... } }`
 */
export const normalizeWeatherCurrent = (input: unknown): WeatherNow | null => {
  const rec = asRecord(input);
  if (!rec) return null;

  const inner = asRecord(rec.now);
  const source = inner ?? rec;

  if (isV1Current(source)) {
    const now = v1Now(source);
    const obsTime = strOf(source.obsTime) || strOf(rec.updateTime);
    return obsTime ? { ...now, obsTime } : now;
  }
  return legacyNow(source);
};

// ── 逐时预报 ───────────────────────────────────────────────────────────────

const legacyHour = (rec: Rec): WeatherHourly => ({
  fxTime: strOf(rec.fxTime),
  temp: strOf(rec.temp),
  precip: strOf(rec.precip),
  humidity: legacyPercent(rec.humidity),
  pressure: strOf(rec.pressure),
  windDir: strOf(rec.windDir),
  windScale: strOf(rec.windScale),
  windSpeed: strOf(rec.windSpeed),
  text: strOf(rec.text),
  icon: strOf(rec.icon),
});

const v1Hour = (rec: Rec): WeatherHourly => {
  const condition = asRecord(rec.condition);
  const wind = asRecord(rec.wind);
  const direction = asRecord(wind?.direction);
  const speed = asRecord(wind?.speed);
  const precipitation = asRecord(rec.precipitation);
  const amount = asRecord(precipitation?.amount);

  return {
    fxTime: strOf(rec.forecastTime),
    temp: fmtNum(measure(rec.temperature)),
    precip: fmtNum(numOf(amount?.value)),
    humidity: fmtNum(ratioToPercent(numOf(rec.humidity))),
    pressure: fmtNum(measure(rec.pressure)),
    windDir: windCompassToChinese(
      strOf(direction?.compass),
      numOf(direction?.degree),
    ),
    windScale: strOf(wind?.scale),
    windSpeed: fmtNum(toKmh(numOf(speed?.value), unitOf(speed))),
    text: strOf(condition?.text),
    icon: strOf(condition?.code),
  };
};

const normalizeHour = (input: unknown): WeatherHourly | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  return isV1Hour(rec) ? v1Hour(rec) : legacyHour(rec);
};

/**
 * 归一逐时预报。
 *
 * 兼容三种容器:v1 `{ hours: [...] }`、旧代 `{ hourly: [...] }`、裸数组。
 */
export const normalizeWeatherHourly = (input: unknown): WeatherHourly[] => {
  const rec = asRecord(input);
  const list = Array.isArray(input)
    ? input
    : rec
      ? asArray(rec.hours ?? rec.hourly)
      : [];
  return list
    .map(normalizeHour)
    .filter((item): item is WeatherHourly => item !== null);
};

// ── 每日预报 ───────────────────────────────────────────────────────────────

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

/** 取当地日期:优先 forecastStartTime,再退到时段 / 日出 */
const dayDate = (
  rec: Rec,
  day: Rec | null,
  night: Rec | null,
  astro: Rec | null,
): string => {
  const candidates = [
    rec.forecastStartTime,
    day?.forecastStartTime,
    night?.forecastStartTime,
    astro?.sunrise,
    rec.forecastEndTime,
  ];
  for (const candidate of candidates) {
    const matched = DATE_PATTERN.exec(strOf(candidate));
    if (matched) return matched[1] ?? '';
  }
  return '';
};

const legacyDay = (rec: Rec): WeatherDay => ({
  fxDate: strOf(rec.fxDate),
  sunrise: strOf(rec.sunrise),
  sunset: strOf(rec.sunset),
  moonrise: strOf(rec.moonrise),
  moonset: strOf(rec.moonset),
  moonPhase: moonPhaseToChinese(strOf(rec.moonPhase)),
  moonPhaseIcon: strOf(rec.moonPhaseIcon),
  tempMax: strOf(rec.tempMax),
  tempMin: strOf(rec.tempMin),
  iconDay: strOf(rec.iconDay),
  textDay: strOf(rec.textDay),
  iconNight: strOf(rec.iconNight),
  textNight: strOf(rec.textNight),
  wind360Day: strOf(rec.wind360Day),
  windDirDay: strOf(rec.windDirDay),
  windScaleDay: strOf(rec.windScaleDay),
  windSpeedDay: strOf(rec.windSpeedDay),
  wind360Night: strOf(rec.wind360Night),
  windDirNight: strOf(rec.windDirNight),
  windScaleNight: strOf(rec.windScaleNight),
  windSpeedNight: strOf(rec.windSpeedNight),
  humidity: legacyPercent(rec.humidity),
  precip: strOf(rec.precip),
  pressure: strOf(rec.pressure),
  vis: strOf(rec.vis),
  cloud: legacyPercent(rec.cloud),
  uvIndex: strOf(rec.uvIndex),
});

const v1Day = (rec: Rec): WeatherDay => {
  const astro = asRecord(rec.astro);
  const day = asRecord(rec.daytime);
  const night = asRecord(rec.nighttime);

  const dayWind = asRecord(day?.wind);
  const nightWind = asRecord(night?.wind);
  const dayDirection = asRecord(dayWind?.direction);
  const nightDirection = asRecord(nightWind?.direction);
  const daySpeed = asRecord(dayWind?.speed);
  const nightSpeed = asRecord(nightWind?.speed);

  const dayCondition = asRecord(day?.condition);
  const nightCondition = asRecord(night?.condition);
  const dayPrecipitation = asRecord(day?.precipitation);
  const dayAmount = asRecord(dayPrecipitation?.amount);

  const tempMax =
    measure(rec.temperatureMax) ??
    measure(day?.temperatureMax) ??
    measure(night?.temperatureMax);
  const tempMin =
    measure(rec.temperatureMin) ??
    measure(day?.temperatureMin) ??
    measure(night?.temperatureMin);

  return {
    fxDate: dayDate(rec, day, night, astro),
    // v1 是完整时间戳("2026-10-21T06:30+08:00"),旧代是 "06:30"
    sunrise: strOf(astro?.sunrise),
    sunset: strOf(astro?.sunset),
    moonrise: strOf(astro?.moonrise),
    moonset: strOf(astro?.moonset),
    moonPhase: moonPhaseToChinese(strOf(astro?.moonPhase)),
    // v1 只给月相代码,没有图标代码
    moonPhaseIcon: '',
    tempMax: fmtNum(tempMax),
    tempMin: fmtNum(tempMin),
    iconDay: strOf(dayCondition?.code),
    textDay: strOf(dayCondition?.text),
    iconNight: strOf(nightCondition?.code),
    textNight: strOf(nightCondition?.text),
    wind360Day: strOf(dayDirection?.degree),
    windDirDay: windCompassToChinese(
      strOf(dayDirection?.compass),
      numOf(dayDirection?.degree),
    ),
    windScaleDay: strOf(dayWind?.scale),
    windSpeedDay: fmtNum(
      toKmh(numOf(daySpeed?.value), unitOf(daySpeed)),
    ),
    wind360Night: strOf(nightDirection?.degree),
    windDirNight: windCompassToChinese(
      strOf(nightDirection?.compass),
      numOf(nightDirection?.degree),
    ),
    windScaleNight: strOf(nightWind?.scale),
    windSpeedNight: fmtNum(
      toKmh(numOf(nightSpeed?.value), unitOf(nightSpeed)),
    ),
    humidity: fmtNum(ratioToPercent(numOf(day?.humidity))),
    precip: fmtNum(numOf(dayAmount?.value)),
    // v1 每日预报不含气压 / 能见度
    pressure: '',
    vis: '',
    cloud: fmtNum(ratioToPercent(numOf(day?.cloudCover))),
    uvIndex: strOf(rec.uvIndexMax),
  };
};

const normalizeDay = (input: unknown): WeatherDay | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  return isV1Day(rec) ? v1Day(rec) : legacyDay(rec);
};

/**
 * 归一每日预报。
 *
 * 兼容三种容器:v1 `{ days: [...] }`、旧代 `{ daily: [...] }`、裸数组。
 */
export const normalizeWeatherDaily = (input: unknown): WeatherDay[] => {
  const rec = asRecord(input);
  const list = Array.isArray(input)
    ? input
    : rec
      ? asArray(rec.days ?? rec.daily)
      : [];
  return list.map(normalizeDay).filter((item): item is WeatherDay => item !== null);
};

// ── 生活指数(v7,尚无新版)─────────────────────────────────────────────────

export const normalizeWeatherIndices = (input: unknown): WeatherIndex[] => {
  const rec = asRecord(input);
  const list = Array.isArray(input) ? input : rec ? asArray(rec.daily) : [];
  return list
    .map((item): WeatherIndex | null => {
      const row = asRecord(item);
      if (!row) return null;
      const name = strOf(row.name);
      const level = strOf(row.level);
      // 既没名称也没档位 = 空条目,丢掉。
      // 口径与后端读入侧(app/core/agent.py)一致:空条目对模型没有信息量,
      // 留着只会让提示词里多一行空壳。
      if (!name && !level) return null;
      return {
        date: strOf(row.date),
        type: strOf(row.type),
        name,
        level,
        category: strOf(row.category),
        text: strOf(row.text),
      };
    })
    .filter((item): item is WeatherIndex => item !== null);
};

// ── 潮汐(v7,尚无新版)──────────────────────────────────────────────────────

const normalizeTide = (input: unknown): TideData | null => {
  const rec = asRecord(input);
  if (!rec) return null;

  const tideTable = asArray(rec.tideTable)
    .map((item): TideTableItem | null => {
      const row = asRecord(item);
      if (!row) return null;
      const type = strOf(row.type).toUpperCase();
      return {
        fxTime: strOf(row.fxTime),
        height: row.height as number | string,
        type: type === 'L' ? 'L' : 'H',
      };
    })
    .filter((item): item is TideTableItem => item !== null);

  const tideHourly = asArray(rec.tideHourly)
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      return {
        fxTime: strOf(row.fxTime),
        height: row.height as number | string,
      };
    })
    .filter((item): item is { fxTime: string; height: number | string } =>
      item !== null,
    );

  if (!tideTable.length && !tideHourly.length) return null;

  return {
    updateTime: strOf(rec.updateTime),
    tideTable,
    tideHourly,
  };
};

// ── 整包 ───────────────────────────────────────────────────────────────────

/**
 * 归一 /weather/full 整包(混代)。
 *
 * current / hourly / daily 走 v1,tide / indices 走 v7。
 */
export const normalizeWeatherFull = (input: unknown): WeatherFullSnapshot => {
  const rec = asRecord(input);
  const currentBlock = rec?.current;
  const currentRec = asRecord(currentBlock);

  const now = normalizeWeatherCurrent(currentBlock);
  const hourly = normalizeWeatherHourly(rec?.hourly);
  const daily = normalizeWeatherDaily(rec?.daily);
  const indices = normalizeWeatherIndices(rec?.indices);

  return {
    now,
    hourly,
    daily,
    indices,
    tide: normalizeTide(rec?.tide),
    // v1 无观测时间字段 —— 退到逐时首条预报时刻
    updateTime:
      strOf(currentRec?.updateTime) || strOf(now?.obsTime) || hourly[0]?.fxTime || '',
    // 地点名 = 城市 + 区县（如 "北京东城"）—— Go 端已拼好，这里只取不用拼
    locationName: strOf(rec?.locationName) || '未知地点',
  };
};

/**
 * 归一 /v2/fishing/index(enriched=true)的天气三块与生活指数。
 *
 * 后端 enriched 响应内嵌 Go 侧 /weather/full 的块,故同样是混代:
 * current_weather 可能是 v1 也可能是旧代,forecasts 可能是 v1 days 也可能是旧代 daily。
 */
export const normalizeFishingIndexPayload = (
  raw: FishingIndexData,
): FishingIndexData => {
  const rec = asRecord(raw);
  if (!rec) return raw;

  const now = normalizeWeatherCurrent(rec.current_weather);
  const daily = normalizeWeatherDaily(rec.forecasts);
  const hourly = normalizeWeatherHourly(rec.hourly_weather);
  // 生活指数没跟着天气换代(v7),字段本来就是扁平的,过一遍归一是为了
  // 统一成字符串视图模型 —— 后端 AI 载荷读的就是这层形状。
  const indices = normalizeWeatherIndices(rec.weather_indices);

  return {
    ...raw,
    current_weather: now ?? undefined,
    forecasts: daily,
    hourly_weather: { hourly },
    weather_indices: indices,
  };
};
