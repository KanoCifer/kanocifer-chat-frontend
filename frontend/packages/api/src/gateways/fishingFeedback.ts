import { apiClient } from "../apiClient";
import type {
  FishingSpotFeedback,
  FishingSpotFeedbackAdminListQuery,
  FishingSpotFeedbackStatusPayload,
} from "@readinglist/types";

// ── 钓点纠错反馈网关 —— 与 go-backend 对齐（Vue / React 共享）──

const API_VERSION = "v3";
const API_URL_BASE = `${API_VERSION}/fish/`;

export interface FishingFeedbackGateway {
  /**
   * 管理后台的反馈队列 —— 按状态 / 类型 / 关键词查。
   *
   * 走独立的 admin 端点：这个域**刻意没有公开的读取端点**（反馈不公开，
   * 任何「按钓点查反馈」的端点都是泄露面），管理员也只能从这一条路看。
   */
  listForAdmin(query?: FishingSpotFeedbackAdminListQuery): Promise<FishingSpotFeedback[]>;
  /**
   * 处理反馈 —— 标记已采纳 / 已处理 / 不属实。
   *
   * 目标状态只能是 accepted / resolved / dismissed：pending 不能作为目标状态，
   * 且 resolved / dismissed 是终态。dismissed 时 note 必填。
   */
  updateStatus(id: string, payload: FishingSpotFeedbackStatusPayload): Promise<void>;
}

export const fishingFeedbackGateway: FishingFeedbackGateway = {
  async listForAdmin(
    query: FishingSpotFeedbackAdminListQuery = {},
  ): Promise<FishingSpotFeedback[]> {
    const res = await apiClient.get<{ data: FishingSpotFeedback[] }>(
      `${API_URL_BASE}feedback/admin`,
      {
        params: {
          status: query.status,
          type: query.type,
          keyword: query.keyword,
          page: query.page,
          page_size: query.page_size,
        },
      },
    );
    return res.data.data;
  },

  async updateStatus(id: string, payload: FishingSpotFeedbackStatusPayload): Promise<void> {
    await apiClient.put(`${API_URL_BASE}feedback/${id}/status`, payload);
  },
};
