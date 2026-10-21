import { describe, it, expect } from 'vitest';
import {
  moonPhaseToChinese,
  normalizeFishingIndexPayload,
  normalizeWeatherCurrent,
  normalizeWeatherDaily,
  normalizeWeatherFull,
  normalizeWeatherHourly,
  normalizeWeatherIndices,
  windCompassToChinese,
} from '../weather';
import type { FishingIndexData } from '@readinglist/types';

/** 和风 v1 实时天气块(取自官方文档示例结构) */
const V1_CURRENT = {
  metadata: { tag: '03ec2ded', attributions: ['https://developer.qweather.com'] },
  condition: { text: '少云', code: '102' },
  temperature: { value: 8.13, unit: '°C' },
  feelsLike: { value: 6.2, unit: '°C' },
  humidity: 0.26,
  wind: {
    direction: { degree: 270, compass: 'wnw' },
    speed: { value: 4.74, unit: 'm/s' },
    scale: 3,
  },
  windGust: { value: 9.8, unit: 'm/s' },
  precipitation: {
    amount: { value: 0, unit: 'mm' },
    intensity: { value: 0, unit: 'mm/h' },
    type: 'none',
  },
  pressure: { value: 1011.5, unit: 'hPa' },
  visibility: { value: 29020, unit: 'm' },
  dewPoint: { value: 3.6, unit: '°C' },
  cloudCover: 0.05,
  uvIndex: 3,
};

/** 旧代(v7)实时天气块 */
const V7_NOW = {
  obsTime: '2026-10-21T13:00+08:00',
  temp: '8',
  feelsLike: '6',
  icon: '102',
  text: '少云',
  wind360: '270',
  windDir: '西风',
  windScale: '3',
  windSpeed: '17',
  humidity: '26',
  precip: '0',
  pressure: '1011',
  vis: '29',
  cloud: '5',
  dew: '4',
};

describe('windCompassToChinese', () => {
  it('maps 16-point codes to Chinese', () => {
    expect(windCompassToChinese('wnw')).toBe('西偏西北风');
    expect(windCompassToChinese('sw')).toBe('西南风');
    expect(windCompassToChinese('n')).toBe('北风');
  });

  it('derives the compass from the degree when the code is missing', () => {
    expect(windCompassToChinese('', 270)).toBe('西风');
    expect(windCompassToChinese(undefined, 0)).toBe('北风');
  });

  it('returns empty string when neither code nor degree is available', () => {
    expect(windCompassToChinese()).toBe('');
  });
});

describe('moonPhaseToChinese', () => {
  it('maps v1 moon phase codes to Chinese', () => {
    expect(moonPhaseToChinese('waxing-gibbous')).toBe('盈凸月');
    expect(moonPhaseToChinese('new-moon')).toBe('新月');
  });

  it('keeps the legacy Chinese phase as is', () => {
    expect(moonPhaseToChinese('盈凸月')).toBe('盈凸月');
  });

  it('returns empty string for empty input', () => {
    expect(moonPhaseToChinese('')).toBe('');
  });
});

describe('normalizeWeatherCurrent', () => {
  it('normalizes the v1 block into the flat view model', () => {
    const now = normalizeWeatherCurrent(V1_CURRENT);

    expect(now).not.toBeNull();
    expect(now?.temp).toBe('8.1');
    expect(now?.feelsLike).toBe('6.2');
    expect(now?.icon).toBe('102');
    expect(now?.text).toBe('少云');
    expect(now?.wind360).toBe('270');
    expect(now?.windDir).toBe('西偏西北风');
    expect(now?.windScale).toBe('3');
    // 4.74 m/s → 17.064 km/h
    expect(now?.windSpeed).toBe('17.1');
    // [0,1] 比例 → 百分比
    expect(now?.humidity).toBe('26');
    expect(now?.cloud).toBe('5');
    // m → km
    expect(now?.vis).toBe('29');
    expect(now?.pressure).toBe('1011.5');
    expect(now?.dew).toBe('3.6');
    expect(now?.precip).toBe('0');
  });

  it('leaves obsTime empty because the v1 payload has no observation time', () => {
    expect(normalizeWeatherCurrent(V1_CURRENT)?.obsTime).toBe('');
  });

  it('keeps the legacy v7 block intact', () => {
    const now = normalizeWeatherCurrent({ code: '200', now: V7_NOW });

    expect(now?.temp).toBe('8');
    expect(now?.windDir).toBe('西风');
    expect(now?.humidity).toBe('26');
    expect(now?.obsTime).toBe('2026-10-21T13:00+08:00');
  });

  it('returns null for a non-object payload', () => {
    expect(normalizeWeatherCurrent(null)).toBeNull();
    expect(normalizeWeatherCurrent('nope')).toBeNull();
  });
});

describe('normalizeWeatherHourly', () => {
  const V1_HOURLY = {
    metadata: { tag: 'dabb37d7' },
    hours: [
      {
        forecastTime: '2026-10-21T13:00+08:00',
        condition: { text: '少云', code: '102' },
        temperature: { value: 31.12, unit: '°C' },
        humidity: 0.76,
        wind: {
          direction: { degree: 215, compass: 'sw' },
          speed: { value: 3.42, unit: 'm/s' },
          scale: 3,
        },
        precipitation: {
          amount: { value: 0.09, unit: 'mm' },
          intensity: { value: 0.09, unit: 'mm/h' },
          probability: 0.31,
          type: 'rain',
        },
        pressure: { value: 1001.5, unit: 'hPa' },
        visibility: { value: 14780, unit: 'm' },
        dewPoint: { value: 26.44, unit: '°C' },
        cloudCover: 0.92,
        uvIndex: 6,
      },
    ],
  };

  it('normalizes the v1 hours container', () => {
    const hours = normalizeWeatherHourly(V1_HOURLY);

    expect(hours).toHaveLength(1);
    expect(hours[0]?.fxTime).toBe('2026-10-21T13:00+08:00');
    expect(hours[0]?.temp).toBe('31.1');
    expect(hours[0]?.precip).toBe('0.1');
    expect(hours[0]?.humidity).toBe('76');
    expect(hours[0]?.pressure).toBe('1001.5');
    expect(hours[0]?.windDir).toBe('西南风');
    expect(hours[0]?.windScale).toBe('3');
    expect(hours[0]?.windSpeed).toBe('12.3');
    expect(hours[0]?.text).toBe('少云');
    expect(hours[0]?.icon).toBe('102');
  });

  it('normalizes the legacy hourly container', () => {
    const hours = normalizeWeatherHourly({
      hourly: [{ fxTime: '2026-10-21T13:00+08:00', temp: '29', precip: '0.5' }],
    });

    expect(hours[0]?.fxTime).toBe('2026-10-21T13:00+08:00');
    expect(hours[0]?.temp).toBe('29');
    expect(hours[0]?.precip).toBe('0.5');
  });

  it('accepts a bare array', () => {
    const hours = normalizeWeatherHourly([
      { forecastTime: '2026-10-21T13:00+08:00', temperature: { value: 20 } },
    ]);

    expect(hours[0]?.temp).toBe('20');
  });

  it('returns an empty array for missing payload', () => {
    expect(normalizeWeatherHourly(undefined)).toEqual([]);
  });
});

describe('normalizeWeatherDaily', () => {
  const V1_DAILY = {
    metadata: { tag: 'dabb37d7' },
    days: [
      {
        forecastStartTime: '2026-10-21T07:00+08:00',
        forecastEndTime: '2026-10-22T07:00+08:00',
        astro: {
          sunrise: '2026-10-21T06:30+08:00',
          sunset: '2026-10-21T18:10+08:00',
          moonrise: '2026-10-21T20:00+08:00',
          moonset: '2026-10-22T04:57+08:00',
          moonPhase: 'waxing-gibbous',
        },
        temperatureMax: { value: 29.94, unit: '°C' },
        temperatureMin: { value: 20.93, unit: '°C' },
        temperatureAvg: { value: 25.57, unit: '°C' },
        uvIndexMax: 6,
        daytime: {
          forecastStartTime: '2026-10-21T07:00+08:00',
          condition: { text: '小雨', code: '305' },
          temperatureMax: { value: 29.94, unit: '°C' },
          temperatureMin: { value: 20.93, unit: '°C' },
          wind: {
            direction: { degree: 270, compass: 'w' },
            speed: { value: 1.87, unit: 'm/s' },
            scale: 2,
          },
          precipitation: {
            amount: { value: 0.75, unit: 'mm' },
            probability: 0.64,
            type: 'rain',
          },
          cloudCover: 0.32,
          humidity: 0.52,
        },
        nighttime: {
          condition: { text: '晴间多云', code: '103' },
          temperatureMax: { value: 29.8, unit: '°C' },
          temperatureMin: { value: 19.95, unit: '°C' },
          wind: {
            direction: { degree: 343, compass: 'nnw' },
            speed: { value: 2.33, unit: 'm/s' },
            scale: 2,
          },
          precipitation: {
            amount: { value: 0, unit: 'mm' },
            probability: 0,
            type: 'none',
          },
          cloudCover: 0.34,
          humidity: 0.56,
        },
      },
    ],
  };

  it('splits the v1 day into daytime / nighttime', () => {
    const days = normalizeWeatherDaily(V1_DAILY);

    expect(days).toHaveLength(1);
    expect(days[0]?.iconDay).toBe('305');
    expect(days[0]?.textDay).toBe('小雨');
    expect(days[0]?.iconNight).toBe('103');
    expect(days[0]?.textNight).toBe('晴间多云');
    expect(days[0]?.windDirDay).toBe('西风');
    expect(days[0]?.windDirNight).toBe('北偏西北风');
    expect(days[0]?.windSpeedDay).toBe('6.7');
    expect(days[0]?.humidity).toBe('52');
    expect(days[0]?.precip).toBe('0.8');
    expect(days[0]?.cloud).toBe('32');
  });

  it('derives fxDate from the local forecast start time', () => {
    expect(normalizeWeatherDaily(V1_DAILY)[0]?.fxDate).toBe('2026-10-21');
  });

  it('keeps the full sunrise timestamp and converts the moon phase code', () => {
    const day = normalizeWeatherDaily(V1_DAILY)[0];

    expect(day?.sunrise).toBe('2026-10-21T06:30+08:00');
    expect(day?.moonPhase).toBe('盈凸月');
  });

  it('blanks pressure and visibility because the v1 daily block has neither', () => {
    const day = normalizeWeatherDaily(V1_DAILY)[0];

    expect(day?.pressure).toBe('');
    expect(day?.vis).toBe('');
  });

  it('keeps the legacy daily block intact', () => {
    const days = normalizeWeatherDaily({
      daily: [
        {
          fxDate: '2026-10-21',
          sunrise: '06:30',
          tempMax: '30',
          tempMin: '21',
          iconDay: '305',
          textDay: '小雨',
          humidity: '52',
          pressure: '1011',
          vis: '29',
        },
      ],
    });

    expect(days[0]?.fxDate).toBe('2026-10-21');
    expect(days[0]?.sunrise).toBe('06:30');
    expect(days[0]?.tempMax).toBe('30');
    expect(days[0]?.pressure).toBe('1011');
    expect(days[0]?.vis).toBe('29');
  });
});

describe('normalizeWeatherIndices', () => {
  it('keeps the v7 indices entries', () => {
    const indices = normalizeWeatherIndices({
      code: '200',
      daily: [
        {
          date: '2026-10-21',
          type: '1',
          name: '穿衣',
          level: '舒适',
          category: '舒适',
          text: '建议穿长袖',
        },
      ],
    });

    expect(indices).toHaveLength(1);
    expect(indices[0]?.name).toBe('穿衣');
    expect(indices[0]?.level).toBe('舒适');
    expect(indices[0]?.text).toBe('建议穿长袖');
  });

  it('drops blank entries instead of forwarding empty rows', () => {
    // 口径与后端读入侧(app/core/agent.py)一致 —— 空条目对模型没有信息量
    const indices = normalizeWeatherIndices({
      daily: [{ date: '2026-10-21' }, { name: '钓鱼指数', level: '1' }],
    });

    expect(indices).toHaveLength(1);
    expect(indices[0]?.name).toBe('钓鱼指数');
  });
});

describe('normalizeWeatherFull', () => {
  it('normalizes the mixed-generation bundle', () => {
    const snapshot = normalizeWeatherFull({
      current: V1_CURRENT,
      hourly: {
        hours: [
          {
            forecastTime: '2026-10-21T13:00+08:00',
            temperature: { value: 20, unit: '°C' },
          },
        ],
      },
      daily: {
        days: [{ forecastStartTime: '2026-10-21T07:00+08:00' }],
      },
      tide: {
        code: '200',
        updateTime: '2026-10-21T12:00+08:00',
        tideTable: [{ fxTime: '2026-10-21T15:00+08:00', height: '2.1', type: 'H' }],
        tideHourly: [{ fxTime: '2026-10-21T13:00+08:00', height: '1.8' }],
      },
      indices: { code: '200', daily: [{ name: '穿衣', level: '舒适' }] },
      locationName: '广州',
    });

    expect(snapshot.now?.temp).toBe('8.1');
    expect(snapshot.hourly).toHaveLength(1);
    expect(snapshot.daily).toHaveLength(1);
    expect(snapshot.indices[0]?.name).toBe('穿衣');
    expect(snapshot.tide?.tideTable[0]?.type).toBe('H');
    expect(snapshot.tide?.tideHourly[0]?.height).toBe('1.8');
    expect(snapshot.locationName).toBe('广州');
  });

  it('falls back to the first hourly forecast time for updateTime', () => {
    const snapshot = normalizeWeatherFull({
      current: V1_CURRENT,
      hourly: {
        hours: [{ forecastTime: '2026-10-21T13:00+08:00' }],
      },
    });

    expect(snapshot.updateTime).toBe('2026-10-21T13:00+08:00');
  });

  it('keeps the legacy updateTime when present', () => {
    const snapshot = normalizeWeatherFull({
      current: { code: '200', updateTime: '2026-10-21T12:00+08:00', now: V7_NOW },
    });

    expect(snapshot.updateTime).toBe('2026-10-21T12:00+08:00');
    expect(snapshot.now?.temp).toBe('8');
  });
});

describe('normalizeFishingIndexPayload', () => {
  it('normalizes the enriched weather blocks', () => {
    const payload: FishingIndexData = {
      fishing_index: 72,
      expert_score: 70,
      residual: 2,
      level: '好',
      feature_breakdown: {},
      current_weather: V1_CURRENT as unknown as FishingIndexData['current_weather'],
      forecasts: [
        {
          forecastStartTime: '2026-10-21T07:00+08:00',
          daytime: { condition: { text: '小雨', code: '305' } },
        } as unknown as NonNullable<FishingIndexData['forecasts']>[number],
      ],
      hourly_weather: {
        hourly: [
          {
            forecastTime: '2026-10-21T13:00+08:00',
            temperature: { value: 20 },
          } as unknown as NonNullable<
            NonNullable<FishingIndexData['hourly_weather']>['hourly']
          >[number],
        ],
      },
    };

    const normalized = normalizeFishingIndexPayload(payload);

    expect(normalized.current_weather?.temp).toBe('8.1');
    expect(normalized.forecasts?.[0]?.fxDate).toBe('2026-10-21');
    expect(normalized.forecasts?.[0]?.iconDay).toBe('305');
    expect(normalized.hourly_weather?.hourly?.[0]?.temp).toBe('20');
    // 钓鱼指数字段原样保留
    expect(normalized.fishing_index).toBe(72);
  });

  it('carries the official life indices through to the AI payload', () => {
    // 后端 enriched 响应透传的 weather_indices 是 v7 条目数组,
    // 必须活着进 AI 载荷 —— 「官方说今天适宜垂钓」是最强信号
    const payload: FishingIndexData = {
      fishing_index: 72,
      expert_score: 70,
      residual: 2,
      level: '好',
      feature_breakdown: {},
      weather_indices: [
        {
          date: '2026-10-21',
          type: '4',
          name: '钓鱼指数',
          level: '1',
          category: '适宜',
          text: '今天适合垂钓',
        },
      ],
    };

    const normalized = normalizeFishingIndexPayload(payload);

    expect(normalized.weather_indices).toHaveLength(1);
    expect(normalized.weather_indices?.[0]?.name).toBe('钓鱼指数');
    expect(normalized.weather_indices?.[0]?.level).toBe('1');
    expect(normalized.weather_indices?.[0]?.category).toBe('适宜');
  });

  it('returns an empty index list when the backend has none', () => {
    const normalized = normalizeFishingIndexPayload({
      fishing_index: 72,
      expert_score: 70,
      residual: 2,
      level: '好',
      feature_breakdown: {},
    });

    expect(normalized.weather_indices).toEqual([]);
  });
});
