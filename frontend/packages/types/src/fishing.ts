// ── 钓鱼域类型聚合（天气/潮汐/钓点/反馈/地图标记） ──────────────────────────
//
// 来源：和风天气 API + 国家海洋预报台潮汐 API + 后端 fishing_index 接口。
// 仅描述网络层数据，不夹带 view-only 派生字段。
//
// 钓点 DTO 与 go-backend/internal/dto/fish.go 对齐 —— 单一真源在后端。

// ---------------------------------------------------------------------------
// 钓点 DTO
// ---------------------------------------------------------------------------

/**
 * 钓点水体类型 —— 与 go-backend document.Kind* 常量、Python models 的 kind 字段共用同一组字面量。
 * 三值封闭：新增类型须同步 Go / Python 的校验枚举。
 */
export type FishingSpotKind = 'lake' | 'river' | 'reservoir';

/** 遍历用的有序全集 —— filter chips / 选择器按此顺序渲染 */
export const FISHING_SPOT_KINDS: readonly FishingSpotKind[] = [
  'lake',
  'river',
  'reservoir',
] as const;

/** 中文展示 label —— UI 层唯一文案来源，勿在组件内内联硬编码 */
export const FISHING_SPOT_KIND_LABELS: Readonly<
  Record<FishingSpotKind, string>
> = {
  lake: '湖泊',
  river: '溪流·江',
  reservoir: '水库',
};

export interface FishingSpot {
  id: string;
  name: string;
  description: string;
  /** [lng, lat] */
  location: [number, number];
  /**
   * 水体类型。字段必需存在，值可为 null ——
   * 遗留行经 migration 名字启发式回填，未匹配的少数留 null，UI 按未分类（muted）渲染。
   */
  kind: FishingSpotKind | null;
  tags: string[];
  rating: number;
  images: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 创建钓点载荷 —— 与 dto.FishingSpotIn 对齐。
 * Name / Location / Kind 必填（binding:"required,oneof=lake river reservoir"），其余可选。
 */
export interface CreateFishingSpotPayload {
  name: string;
  /** [lng, lat] */
  location: [number, number];
  /** 新建时严格必填 —— 不接受 null，后端 oneof 校验会拒绝非法值 */
  kind: FishingSpotKind;
  description?: string;
  tags?: string[];
  rating?: number;
  images?: string[];
}

/**
 * 更新钓点载荷 —— 与 dto.FishingSpotUpdate 对齐。
 * 全字段可选：未传 = 不动，传了 = 显式覆盖（Partial update）。
 */
export type UpdateFishingSpotPayload = Partial<CreateFishingSpotPayload>;

/** 钓点业务字段(location 除外)—— MapMarker.extraData 的精确类型 */
export type SpotDetail = Omit<FishingSpot, 'location'>;

// ---------------------------------------------------------------------------
// 钓点编辑器(view 层契约，与 useSpotEditor seam 配套)
// ---------------------------------------------------------------------------

/**
 * 编辑器内的"图片条目" view-model —— 来自 initial.images(edit 模式)或本地新增上传(create 模式)。
 *
 * 与 DTO `images: string[]` 区别:组件层需要在选片/上传过程中维护每个条目的 id / uploadedAt / description,
 * 所以 seam 的 picture 列表是 `{id, url, ...}` 而不是纯字符串数组,提交时再 .map(p => p.url) 拍平。
 */
export interface SpotPicture {
  id: string;
  uploadedAt: string;
  url: string;
  description: string;
}

/**
 * 编辑器草稿 —— create 与 edit 共用同一份字段结构,行为差异由 seam 内部分支。
 *
 * - create 模式:全字段必填(name 必填;kind/coordinate 后置必填,canSubmit 守住)
 * - edit 模式:location 不在草稿里(交给 marker / 后端),kind 可回填;pictures 走单独 ref。
 */
export interface SpotEditorDraft {
  name: string;
  description: string;
  /** 编辑器内用逗号分隔的字符串;提交时 split → trim → filter(Boolean) → tags: string[] */
  tags: string;
  rating: number;
  /** create 模式下必填(null = 未选);edit 模式下可空字符串,与后端保持一致。 */
  kind: FishingSpotKind | null;
  /** [lng, lat] —— create 模式必填;edit 模式始终 null,坐标编辑走其他 seam。 */
  coordinate: [number, number] | null;
}

/** 单钓点图片上限 9 —— 与 SpotFormPanel / SpotDetailPanel 既有 MAX_PICTURES 对齐。 */
export const SPOT_MAX_PICTURES = 9;
/** 单张图片字节上限 5MB —— 与 SpotFormPanel / SpotDetailPanel 既有 MAX_UPLOAD_BYTES 对齐。 */
export const SPOT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 潮汐
// ---------------------------------------------------------------------------

export interface TideTableItem {
  fxTime: string;
  height: number | string;
  type: 'H' | 'L';
}

export interface TideData {
  updateTime: string;
  tideTable: TideTableItem[];
  tideHourly: Array<{ fxTime: string; height: number | string }>;
}

/** v3 潮汐 API 响应包装层：data 字段含 fromCache 元数据 */
export interface TideApiEnvelope {
  data: TideData;
  fromCache: boolean;
}

/** @deprecated 兼容别名：v2 时直接返回 raw TideData；v3 后等价于 TideApiEnvelope */
export type TideResponse = TideApiEnvelope;

// ---------------------------------------------------------------------------
// 天气（和风天气 API 原始响应）
//
// 两代并存 —— 后端 `internal/infra/qweather` 同时挂着:
//   - 新(v1):/weather/v1/current|hourly|daily —— 数值 + 嵌套对象,路径参数纬度在前
//   - 旧(v7):/v7/ocean/tide、/v7/indices/1d —— 字符串 + 扁平字段
//
// 潮汐与生活指数尚无新版,故 /weather/full 是「混代」的。
// 前端不直接消费原始结构:统一经 `@readinglist/utils` 的 domain/weather 归一器
// 收口成下方「视图模型」(WeatherNow / WeatherHourly / WeatherDay / WeatherIndex)。
// ---------------------------------------------------------------------------

// ── 和风 v1（新一代）原始结构 ─────────────────────────────────────────────
// 官方文档:https://dev.qweather.com/docs/api/weather/

export interface WeatherV1Metadata {
  /** 数据唯一标识 */
  tag?: string;
  /** 数据归因信息 */
  attributions?: string[];
}

export interface WeatherV1Condition {
  /** 本地化天气现象描述,如「少云」 */
  text?: string;
  /** 天气现象代码,如「102」—— 与图标字体 qi-<code> 对应 */
  code?: string;
}

/** 带单位的数值 */
export interface WeatherV1Measurement {
  value?: number;
  unit?: string;
}

export interface WeatherV1Wind {
  direction?: {
    /** 风向角度,取值 [0,359] */
    degree?: number;
    /** 16 方位代码,如 "wnw" */
    compass?: string;
  };
  speed?: WeatherV1Measurement;
  /** 蒲福风级 */
  scale?: number;
}

export interface WeatherV1Precipitation {
  /** 累计降水量 */
  amount?: WeatherV1Measurement;
  /** 降水强度 */
  intensity?: WeatherV1Measurement;
  /** 降水概率,取值 [0,1] */
  probability?: number;
  /** rain / snow / ice / mixed / none / unknown */
  type?: string;
}

/** 实时天气块(/weather/v1/current) */
export interface WeatherV1Current {
  metadata?: WeatherV1Metadata;
  condition?: WeatherV1Condition;
  temperature?: WeatherV1Measurement;
  feelsLike?: WeatherV1Measurement;
  /** 相对湿度,取值 [0,1] —— 旧代是百分数字符串 */
  humidity?: number;
  wind?: WeatherV1Wind;
  windGust?: WeatherV1Measurement;
  precipitation?: WeatherV1Precipitation;
  pressure?: WeatherV1Measurement;
  visibility?: WeatherV1Measurement;
  dewPoint?: WeatherV1Measurement;
  /** 云量,取值 [0,1] */
  cloudCover?: number;
  uvIndex?: number;
}

/** 逐时预报条目(/weather/v1/hourly) */
export interface WeatherV1Hour extends WeatherV1Current {
  /** 预报时刻,如 "2026-10-21T13:00+08:00"(localTime=true) */
  forecastTime?: string;
}

export interface WeatherV1Astro {
  sunrise?: string;
  sunset?: string;
  moonrise?: string;
  moonset?: string;
  /** 月相代码,如 "waxing-gibbous" —— 旧代是中文 */
  moonPhase?: string;
}

/** 白天 / 夜间时段 */
export interface WeatherV1DayPart {
  forecastStartTime?: string;
  forecastEndTime?: string;
  condition?: WeatherV1Condition;
  temperatureMax?: WeatherV1Measurement;
  temperatureMin?: WeatherV1Measurement;
  /** 平均相对湿度,取值 [0,1] */
  humidity?: number;
  wind?: WeatherV1Wind;
  windGustMax?: WeatherV1Measurement;
  precipitation?: {
    amount?: WeatherV1Measurement;
    probability?: number;
    type?: string;
  };
  /** 平均总云量,取值 [0,1] */
  cloudCover?: number;
}

/** 每日预报条目(/weather/v1/daily) */
export interface WeatherV1Day {
  forecastStartTime?: string;
  forecastEndTime?: string;
  astro?: WeatherV1Astro;
  temperatureMax?: WeatherV1Measurement;
  temperatureMin?: WeatherV1Measurement;
  temperatureAvg?: WeatherV1Measurement;
  uvIndexMax?: number;
  /** 白天,当地 [07:00,19:00) */
  daytime?: WeatherV1DayPart;
  /** 夜间,当地 [19:00,次日07:00) */
  nighttime?: WeatherV1DayPart;
}

export interface WeatherV1HourlyResponse {
  metadata?: WeatherV1Metadata;
  hours?: WeatherV1Hour[];
}

export interface WeatherV1DailyResponse {
  metadata?: WeatherV1Metadata;
  days?: WeatherV1Day[];
}

// ── 视图模型（归一后,供 UI / AI 分析 payload 消费）─────────────────────────
// 保持「字符串 + 扁平字段」形态:UI 组件与 /v2/llm/weather-analysis 的
// weather_data 契约不因上游换代而变动。

export interface WeatherHourly {
  fxTime: string;
  /** 归一后的数值字符串,如 "29";消费方需自行 Number() 转换 */
  temp?: string;
  /** 归一后的数值字符串,如 "0.5";消费方需自行 Number() 转换 */
  precip?: string;
  humidity?: string;
  pressure?: string;
  windDir?: string;
  windScale?: string;
  windSpeed?: string;
  text?: string;
  icon?: string;
}

export interface WeatherDay {
  /** YYYY-MM-DD(当地日期) */
  fxDate: string;
  /** 日出时间 —— v1 是完整时间戳("2026-10-21T06:30+08:00"),v7 是 "06:30" */
  sunrise: string;
  /** 日落时间 —— 同 sunrise */
  sunset: string;
  moonrise: string;
  moonset: string;
  /** 月相中文描述(由 v1 的 "waxing-gibbous" 之类代码转换而来) */
  moonPhase: string;
  /** 月相图标代码 —— v1 不提供,归一后为空 */
  moonPhaseIcon: string;
  tempMax: string;
  tempMin: string;
  iconDay: string;
  textDay: string;
  iconNight: string;
  textNight: string;
  wind360Day: string;
  windDirDay: string;
  windScaleDay: string;
  windSpeedDay: string;
  wind360Night: string;
  windDirNight: string;
  windScaleNight: string;
  windSpeedNight: string;
  /** 百分比字符串(如 "69")—— v1 原始值是 [0,1] 比例 */
  humidity: string;
  precip: string;
  /** 气压 —— v1 每日预报不含气压,归一后为空 */
  pressure: string;
  /** 能见度(km)—— v1 每日预报不含能见度,归一后为空 */
  vis: string;
  /** 百分比字符串 —— v1 原始值是 [0,1] 比例 */
  cloud: string;
  uvIndex: string;
}

/** @deprecated 旧代(v7)每日预报包装层 —— 新代为 WeatherV1DailyResponse */
export interface WeatherForecastResponse {
  code: string;
  updateTime: string;
  fxLink: string;
  daily?: WeatherDay[];
  refer?: {
    sources?: string[];
    license?: string[];
  };
}

export interface WeatherIndex {
  date: string;
  type: string;
  name: string;
  level: string;
  category: string;
  text: string;
}

export interface WeatherIndicesResponse {
  code: string;
  updateTime: string;
  fxLink: string;
  daily?: WeatherIndex[];
  refer?: {
    sources?: string[];
    license?: string[];
  };
}

export interface WeatherNow {
  /** 观测时间 —— v1 payload 无此字段,归一后为空字符串(UI 需容错) */
  obsTime: string;
  temp: string;
  feelsLike: string;
  icon: string;
  text: string;
  wind360: string;
  /** 风向中文描述 —— v1 给的是 16 方位代码(如 "wnw"),归一时转中文 */
  windDir: string;
  windScale: string;
  /** 风速(km/h)—— v1 原始单位为 m/s,归一时换算 */
  windSpeed: string;
  /** 百分比字符串 —— v1 原始值是 [0,1] 比例 */
  humidity: string;
  precip: string;
  pressure: string;
  /** 能见度(km)—— v1 原始单位为 m,归一时换算 */
  vis: string;
  /** 百分比字符串 —— v1 原始值是 [0,1] 比例 */
  cloud: string;
  dew: string;
}

/** @deprecated 旧代(v7)实时天气包装层 —— 新代为 WeatherV1Current */
export interface WeatherLiveResponse {
  code: string;
  updateTime: string;
  fxLink: string;
  now?: WeatherNow;
  refer?: {
    sources?: string[];
    license?: string[];
  };
}

/**
 * /weather/full 原始响应 —— **混代**。
 *
 * current / hourly / daily 走 v1(嵌套数值),tide / indices 走 v7(扁平字符串)。
 * 块内结构随上游代际变化,故此处不写死具体形状:统一交给
 * `normalizeWeatherFull`(@readinglist/utils)收口成 WeatherFullSnapshot。
 */
export interface WeatherFullResponse {
  /** v1 实时天气块,或旧代 { code, updateTime, now } 包装层 */
  current?: unknown;
  /** v1 { hours: [...] },或旧代 { hourly: [...] } */
  hourly?: unknown;
  /** v1 { days: [...] },或旧代 { daily: [...] } */
  daily?: unknown;
  /** v7 潮汐 —— 尚无新版 */
  tide?: TideData;
  /** v7 生活指数 —— 尚无新版 */
  indices?: WeatherIndicesResponse;
  /**
   * 地点名称 —— **城市 + 区县**（如 "北京东城"、"杭州西湖"）。
   *
   * 来自 Go 端 GeoAPI 城市检索（/geo/v2/city/lookup）：上游 `name` 是区县、
   * `adm2` 是城市，Go 端拼好后给出。原先这里是景点 POI 名，配的 `poiId`
   * 一并下线了。
   */
  locationName?: string;
}

/** /weather/full 归一后的快照 —— UI 与 AI 分析的统一输入 */
export interface WeatherFullSnapshot {
  now: WeatherNow | null;
  hourly: WeatherHourly[];
  daily: WeatherDay[];
  indices: WeatherIndex[];
  tide: TideData | null;
  /** 数据更新时间 —— v1 无观测时间字段,取逐时首条预报时刻兜底 */
  updateTime: string;
  /** 地点名称 —— 城市 + 区县（如 "北京东城"） */
  locationName: string;
}

// ---------------------------------------------------------------------------
// 钓鱼指数 / 反馈
// ---------------------------------------------------------------------------

export type FishingLevel = '爆护' | '好' | '一般' | '差' | '空军';
export type FishingIndexLevel = FishingLevel | '极好';
export type FishingFeedbackLevel = FishingLevel;

export interface FishingIndexData {
  fishing_index: number;
  expert_score: number;
  residual: number;
  level: FishingIndexLevel;
  feature_breakdown: Record<string, number>;
  // enriched 模式下附加的天气数据（后端 /v2/fishing/index enriched=true 时填充）
  // 天气三块在 API 网关层已由 v7/v1 归一器收敛为视图模型,此处拿到的即最终形态。
  current_weather?: WeatherNow;
  forecasts?: WeatherDay[];
  location_name?: string;
  tide_data?: TideData;
  hourly_weather?: { hourly?: WeatherHourly[] };
  /**
   * 生活指数（后端 enriched 响应透传的和风 v7 indices 条目）。
   *
   * 官方没给新版，这一块本来就是扁平的，与 `WeatherIndex` 视图模型一一对应。
   * 缺这一项 = AI 拿不到「官方说今天适宜垂钓」这个最强信号。
   */
  weather_indices?: WeatherIndex[] | null;
}

export interface FishingFeedbackData {
  fishing_index: number;
  level: FishingIndexLevel;
  temperature: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  precipitation: number;
  indices: number;
  tide_level: number;
  tide_type?: '涨潮' | '退潮';
  tide_range: number;
  hours_to_next_tide: number;
}

export interface FishingFeedbackPayload {
  location_id: string;
  location_name: string;
  fishing_time: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  wind_speed?: number;
  precipitation?: number;
  indices?: number;
  tide_level?: number;
  tide_type?: '涨潮' | '退潮';
  tide_range?: number;
  hours_to_next_tide?: number;
  feedback: FishingFeedbackLevel;
}

export interface FishingFeedbackResponse {
  success: boolean;
  record_id: string;
  expert_score: number;
  residual: number;
}

// ---------------------------------------------------------------------------
// 钓鱼统计
// ---------------------------------------------------------------------------

export interface FishingStats {
  total_records: number;
  latest_record_time: string | null;
}

// ---------------------------------------------------------------------------
// 地图标记（框架无关）
// ---------------------------------------------------------------------------

/**
 * 地图标记点 DTO（不耦合 AMap SDK —— 消费方内部转为 AMap.Marker）。
 *
 * 字段:
 * - position:  经纬度 [lng, lat]
 * - kind:      水体类型（必需；null = 未分类遗留行）—— 标记配色 / 侧栏过滤的唯一依据，
 *              提升到顶层而非只读 extraData，因为 extraData 可缺省而 kind 渲染必用。
 * - content:   自定义 DOM 字符串（可选；默认使用内置 SVG）
 * - offset:    像素偏移 [x, y]（可选；与 content 配合使用）
 * - extraData: 钓点业务数据（name/description/tags/rating/images 等，location 除外）
 */
export interface MapMarker {
  position: [number, number];
  kind: FishingSpotKind | null;
  content?: string;
  offset?: [number, number];
  extraData?: Omit<FishingSpot, 'location'>;
}

// ---------------------------------------------------------------------------
// AI 分析聚合
// ---------------------------------------------------------------------------

/** 喂给 AI 分析的聚合 view-model。 */
export interface WeatherAnalysisPayload {
  liveWeather?: WeatherNow | null;
  forecasts?: WeatherDay[];
  tideData?: TideData | null;
  weatherIndices?: Array<Record<string, unknown>>;
  fishingIndex?: FishingIndexData;
  locationName?: string;
  tideSpotName?: string;
}
