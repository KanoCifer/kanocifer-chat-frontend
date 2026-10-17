// 站点公告 gateway。读接口公开；写接口需要 access token + ADMIN_USER_IDS 白名单，
// token 由 apiClient 请求拦截器统一注入，401 自动走刷新重试。
import { apiClient, extractData } from '../apiClient';
import type { ApiResponse } from '../types';
import type { Announcement, AnnouncementPayload } from '@readinglist/types';

export interface AnnouncementGateway {
  /** GET v3/announcements */
  list: () => Promise<Announcement[]>;
  /** GET v3/announcements/:id */
  get: (id: number) => Promise<Announcement>;
  /** POST v3/announcements */
  create: (payload: AnnouncementPayload) => Promise<Announcement>;
  /** PUT v3/announcements/:id — 全量覆盖，缺字段会被服务端写空并 400 */
  update: (id: number, payload: AnnouncementPayload) => Promise<void>;
  /** DELETE v3/announcements/:id */
  remove: (id: number) => Promise<void>;
}

export const announcementGateway: AnnouncementGateway = {
  list() {
    // 读接口带 Cache-Control: public, max-age=3600，管理端手动刷新要绕开浏览器缓存
    return apiClient
      .get<ApiResponse<Announcement[]>>('v3/announcements', {
        params: { _t: Date.now() },
      })
      .then(extractData);
  },

  get(id) {
    return apiClient
      .get<ApiResponse<Announcement>>(`v3/announcements/${id}`)
      .then(extractData);
  },

  create(payload) {
    return apiClient
      .post<ApiResponse<Announcement>>('v3/announcements', payload)
      .then(extractData);
  },

  update(id, payload) {
    // 成功响应的 data 是 null，没有可解包的东西
    return apiClient
      .put<ApiResponse<null>>(`v3/announcements/${id}`, payload)
      .then(() => undefined);
  },

  remove(id) {
    return apiClient
      .delete<ApiResponse<null>>(`v3/announcements/${id}`)
      .then(() => undefined);
  },
};
