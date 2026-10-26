import { apiClient } from "../apiClient";
import { normalizeFishingIndexPayload, normalizeWeatherFull } from "@readinglist/utils";
import type {
  FishingFeedbackPayload,
  FishingFeedbackResponse,
  FishingIndexData,
  FishingStats,
  TideApiEnvelope,
  WeatherFullResponse,
  WeatherFullSnapshot,
} from "@readinglist/types";

// ── 钓鱼指数 / 天气 / 潮汐网关（Vue / React 共享）──
//
// 天气相关的上游结构是「混代」的:后端 Go 侧同时挂着和风 v1(current/hourly/daily)
// 与 v7(tide/indices)。归一在网关层收口 —— 消费方拿到的永远是扁平视图模型,
// 两端 UI 与 AI 分析 payload 都不需要知道上游换代。

export interface FishingGateway {
  /** 获取钓鱼指数 */
  getFishingIndex(payload: {
    location: [number, number];
    enriched?: boolean;
  }): Promise<FishingIndexData>;
  /** 提交钓鱼反馈 */
  postFishingFeedback(payload: FishingFeedbackPayload): Promise<FishingFeedbackResponse>;
  /** 获取钓鱼统计 */
  getFishingStats(): Promise<FishingStats>;
  /** 获取潮汐数据 */
  getTide(payload: { harbor: string; date: string }): Promise<TideApiEnvelope>;
  /** 获取完整天气数据（已归一成视图模型） */
  getWeatherFull(payload: { location: [number, number] }): Promise<WeatherFullSnapshot>;
  /** 获取高德地图安全密钥 */
  getSecurityKey(): Promise<{ securityJsCode: string }>;
}

export const fishingGateway: FishingGateway = {
  async getFishingIndex(payload: {
    location: [number, number];
    enriched?: boolean;
  }): Promise<FishingIndexData> {
    const [lng, lat] = payload.location;
    const res = await apiClient.get<{ data: FishingIndexData }>("v2/fishing/index", {
      params: {
        location: `${lng.toFixed(2)},${lat.toFixed(2)}`,
        enriched: payload.enriched ?? true,
      },
    });
    // enriched 响应内嵌天气三块,同样是混代 —— 出网关即归一
    return normalizeFishingIndexPayload(res.data.data);
  },

  async postFishingFeedback(payload: FishingFeedbackPayload): Promise<FishingFeedbackResponse> {
    const res = await apiClient.post<{ data: FishingFeedbackResponse }>("v3/fish/records", payload);
    return res.data.data;
  },

  async getFishingStats(): Promise<FishingStats> {
    const res = await apiClient.get<{ data: FishingStats }>("v2/fishing/stats");
    return res.data.data;
  },

  async getTide(payload: { harbor: string; date: string }): Promise<TideApiEnvelope> {
    const res = await apiClient.get<{ data: TideApiEnvelope }>("v3/weather/tide", {
      params: payload,
    });
    return res.data.data;
  },

  async getWeatherFull(payload: { location: [number, number] }): Promise<WeatherFullSnapshot> {
    const [lng, lat] = payload.location;
    const res = await apiClient.get<{ data: WeatherFullResponse }>("v3/weather/full", {
      params: { location: `${lng.toFixed(2)},${lat.toFixed(2)}` },
    });
    return normalizeWeatherFull(res.data.data);
  },

  async getSecurityKey(): Promise<{ securityJsCode: string }> {
    const res = await apiClient.get<{ data: { securityJsCode: string } }>("v3/amap/security-key");
    return res.data.data;
  },
};
