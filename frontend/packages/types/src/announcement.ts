// 站点公告。契约见「公告接口接入指南」（/api/v3/announcements）。
//
// type 是服务端白名单：只有这 6 个值合法，传其他值服务端返回 400。服务端将来
// 新增分类时前端编译期不会报错（TS 仍按联合类型收窄），所以读取侧一律经
// toKnownType 降级为 general，避免渲染出空白。

export const ANNOUNCEMENT_TYPES = [
  'general',
  'feature',
  'update',
  'maintenance',
  'security',
  'credit',
] as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

/** 标题上限，服务端 trim 后按字符数校验。 */
export const ANNOUNCEMENT_TITLE_MAX = 255;

export interface Announcement {
  id: number;
  title: string;
  content: string;
  type: AnnouncementType;
  /** RFC3339 UTC 字符串，零值时为空串（formatDate 会兜底成「未知时间」）。 */
  created_at: string;
  updated_at: string;
}

/** 三个写接口共用。PUT 是全量覆盖，title / content / type 必须一起发。 */
export interface AnnouncementPayload {
  title: string;
  content: string;
  type?: AnnouncementType;
}

/** 未知分类（服务端新增）降级为 general，不抛错。 */
export function toKnownType(type: string | null | undefined): AnnouncementType {
  return (ANNOUNCEMENT_TYPES as readonly string[]).includes(type ?? '')
    ? (type as AnnouncementType)
    : 'general';
}
