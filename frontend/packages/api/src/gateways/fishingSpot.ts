import { apiClient } from "../apiClient";
import type {
  CreateFishingSpotPayload,
  FishingSpot,
  FishingSpotAdminListQuery,
  FishingSpotReviewPayload,
  UpdateFishingSpotPayload,
} from "@readinglist/types";

// ── 钓点网关 —— 与 go-backend 对齐（Vue / React 共享）──

const API_VERSION = "v3";
const API_URL_BASE = `${API_VERSION}/fish/`;

/** 软删 / 物理删除选项 —— 与 handler DeleteFishingSpot ?hard=true 对齐 */
export interface DeleteFishingSpotOptions {
  /** true = 物理删除；省略 / false = 软删（设 DeletedAt） */
  hard?: boolean;
}

export interface FishingSpotGateway {
  list(): Promise<FishingSpot[]>;
  getByID(id: string): Promise<FishingSpot>;
  create(payload: CreateFishingSpotPayload): Promise<void>;
  update(id: string, payload: UpdateFishingSpotPayload): Promise<void>;
  remove(id: string, options?: DeleteFishingSpotOptions): Promise<void>;
  /**
   * 管理后台的钓点列表 —— 按审核状态查。
   *
   * 走独立的 admin 端点而不是给 list 加参数：公开列表在服务端把 status
   * 写死成 approved，"按状态查"这件事只有管理员端点能做。
   */
  listForReview(query?: FishingSpotAdminListQuery): Promise<FishingSpot[]>;
  /** 审核 —— 放行或驳回。驳回时 note 必填。 */
  review(id: string, payload: FishingSpotReviewPayload): Promise<void>;
}

export const fishingSpotGateway: FishingSpotGateway = {
  async list(): Promise<FishingSpot[]> {
    const res = await apiClient.get<{ data: FishingSpot[] }>(`${API_URL_BASE}spots`);
    return res.data.data;
  },

  async getByID(id: string): Promise<FishingSpot> {
    const res = await apiClient.get<{ data: FishingSpot }>(`${API_URL_BASE}spots/${id}`);
    return res.data.data;
  },

  async create(payload: CreateFishingSpotPayload): Promise<void> {
    await apiClient.post(`${API_URL_BASE}spots`, payload);
  },

  /**
   * 部分更新。
   *
   * 用 PUT 而不是 PATCH：后端只注册了 PUT（PATCH 那条路由早就摘了 ——
   * 小程序的 wx.request 发不出这个动词，留着等于给客户端留一条永远走不通的路）。
   *
   * ⚠️ `tags` / `images` 是整组替换：传数组 = 整组换掉，不传 = 不动。
   * 只改名字时也得把它们的原值带上，否则等于清空。
   */
  async update(id: string, payload: UpdateFishingSpotPayload): Promise<void> {
    await apiClient.put(`${API_URL_BASE}spots/${id}`, payload);
  },

  async remove(id: string, options: DeleteFishingSpotOptions = {}): Promise<void> {
    await apiClient.delete(`${API_URL_BASE}spots/${id}`, {
      params: { hard: options.hard ? "true" : undefined },
    });
  },

  async listForReview(query: FishingSpotAdminListQuery = {}): Promise<FishingSpot[]> {
    const res = await apiClient.get<{ data: FishingSpot[] }>(`${API_URL_BASE}spots/admin`, {
      params: {
        status: query.status,
        kind: query.kind,
        tag: query.tag,
        keyword: query.keyword,
        page: query.page,
        page_size: query.page_size,
        order_by: query.order_by,
        desc: query.desc,
      },
    });
    return res.data.data;
  },

  async review(id: string, payload: FishingSpotReviewPayload): Promise<void> {
    await apiClient.post(`${API_URL_BASE}spots/${id}/review`, payload);
  },
};
