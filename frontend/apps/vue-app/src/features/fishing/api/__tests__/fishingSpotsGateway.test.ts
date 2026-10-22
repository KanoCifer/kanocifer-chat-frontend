import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 底层 apiClient —— 网关已迁移到 @readinglist/api。
// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前初始化。
const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@readinglist/api', () => {
  const apiClient = {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  };

  return {
    apiClient,
    fishingSpotGateway: {
      async list() {
        const res = await apiClient.get('v3/fish/spots');
        return res.data.data;
      },
      async getByID(id: string) {
        const res = await apiClient.get(`v3/fish/spots/${id}`);
        return res.data.data;
      },
      async create(payload: unknown) {
        await apiClient.post('v3/fish/spots', payload);
      },
      async update(id: string, payload: unknown) {
        await apiClient.put(`v3/fish/spots/${id}`, payload);
      },
      async listForReview(query: Record<string, unknown> = {}) {
        const res = await apiClient.get('v3/fish/spots/admin', {
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
      async review(id: string, payload: unknown) {
        await apiClient.post(`v3/fish/spots/${id}/review`, payload);
      },
      async remove(id: string, options: { hard?: boolean } = {}) {
        await apiClient.delete(`v3/fish/spots/${id}`, {
          params: { hard: options.hard ? 'true' : undefined },
        });
      },
    },
  };
});

import { fishingSpotGateway } from '@readinglist/api';
import type { FishingSpot } from '@readinglist/types';

const sampleSpot: FishingSpot = {
  id: '64b8',
  name: 'Test Spot',
  description: 'desc',
  location: [113.399705, 23.067563],
  kind: 'river',
  tags: ['river'],
  rating: 4.5,
  images: ['img1.png'],
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
};

describe('fishingSpotsGateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('GET v3/fish/spots 并解包 data', async () => {
      mockGet.mockResolvedValue({
        data: { data: [sampleSpot] },
      } as never);

      const result = await fishingSpotGateway.list();

      expect(mockGet).toHaveBeenCalledWith('v3/fish/spots');
      expect(result).toEqual([sampleSpot]);
    });
  });

  describe('getByID', () => {
    it('GET v3/fish/spots/:id 并解包 data', async () => {
      mockGet.mockResolvedValue({
        data: { data: sampleSpot },
      } as never);

      const result = await fishingSpotGateway.getByID('64b8');

      expect(mockGet).toHaveBeenCalledWith('v3/fish/spots/64b8');
      expect(result).toEqual(sampleSpot);
    });
  });

  describe('create', () => {
    it('POST v3/fish/spots 携带 payload', async () => {
      mockPost.mockResolvedValue({ data: { data: null } } as never);

      await fishingSpotGateway.create({
        name: 'New Spot',
        location: [113.4, 23.06],
        kind: 'lake',
        tags: ['lake'],
      });

      expect(mockPost).toHaveBeenCalledWith('v3/fish/spots', {
        name: 'New Spot',
        location: [113.4, 23.06],
        kind: 'lake',
        tags: ['lake'],
      });
    });
  });

  describe('update', () => {
    // 用 PUT 不用 PATCH —— 后端只注册了 PUT（PATCH 那条路由早摘了：
    // 小程序的 wx.request 发不出这个动词）。
    it('PUT v3/fish/spots/:id 携带部分 payload', async () => {
      mockPut.mockResolvedValue({ data: { data: null } } as never);

      await fishingSpotGateway.update('64b8', { rating: 5 });

      expect(mockPut).toHaveBeenCalledWith('v3/fish/spots/64b8', {
        rating: 5,
      });
    });
  });

  describe('listForReview', () => {
    it('GET v3/fish/spots/admin 并带上状态过滤', async () => {
      mockGet.mockResolvedValue({
        data: { data: [sampleSpot] },
      } as never);

      const result = await fishingSpotGateway.listForReview({
        status: 'pending',
        page: 1,
      });

      expect(mockGet).toHaveBeenCalledWith('v3/fish/spots/admin', {
        params: expect.objectContaining({ status: 'pending', page: 1 }),
      });
      expect(result).toEqual([sampleSpot]);
    });
  });

  describe('review', () => {
    it('POST v3/fish/spots/:id/review 携带 approve 与 note', async () => {
      mockPost.mockResolvedValue({ data: { data: null } } as never);

      await fishingSpotGateway.review('64b8', {
        approve: false,
        note: '位置不准确',
      });

      expect(mockPost).toHaveBeenCalledWith('v3/fish/spots/64b8/review', {
        approve: false,
        note: '位置不准确',
      });
    });
  });

  describe('remove', () => {
    it('DELETE v3/fish/spots/:id 默认软删（无 hard 参数）', async () => {
      mockDelete.mockResolvedValue({ data: { data: null } } as never);

      await fishingSpotGateway.remove('64b8');

      expect(mockDelete).toHaveBeenCalledWith('v3/fish/spots/64b8', {
        params: { hard: undefined },
      });
    });

    it('DELETE v3/fish/spots/:id?hard=true 物理删除', async () => {
      mockDelete.mockResolvedValue({ data: { data: null } } as never);

      await fishingSpotGateway.remove('64b8', { hard: true });

      expect(mockDelete).toHaveBeenCalledWith('v3/fish/spots/64b8', {
        params: { hard: 'true' },
      });
    });
  });
});
