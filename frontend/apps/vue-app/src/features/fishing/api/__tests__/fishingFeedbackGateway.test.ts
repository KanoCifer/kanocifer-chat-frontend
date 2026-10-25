import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 底层 apiClient —— 网关已迁移到 @readinglist/api。
// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前初始化。
const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock('@readinglist/api', () => {
  const apiClient = {
    get: mockGet,
    put: mockPut,
  };

  return {
    apiClient,
    fishingFeedbackGateway: {
      async listForAdmin(query: Record<string, unknown> = {}) {
        const res = await apiClient.get('v3/fish/feedback/admin', {
          params: {
            status: query.status,
            type: query.type,
            keyword: query.keyword,
            page: query.page,
            page_size: query.page_size,
          },
        });
        return res.data.data;
      },
      async updateStatus(id: string, payload: unknown) {
        await apiClient.put(`v3/fish/feedback/${id}/status`, payload);
      },
    },
  };
});

import { fishingFeedbackGateway } from '@readinglist/api';
import type { FishingSpotFeedback } from '@readinglist/types';

const sampleFeedback: FishingSpotFeedback = {
  id: 'f3a',
  spot_id: 'b7e',
  spot_name: '雁田水库',
  type: 'fee_wrong',
  description: '上周去已经改成收费 30 元/天，页面上还写着免费。',
  images: ['feedback/12/9f8e7d6c.jpg'],
  corrected_fee_type: 'paid',
  corrected_fee_amount: 30,
  status: 'pending',
  review_note: '',
  reporter: { user_id: 12, name: '钓鱼佬', avatar: '' },
  created_at: '2026-10-25T09:12:33Z',
  updated_at: '2026-10-25T09:12:33Z',
  reviewed_at: null,
};

describe('fishingFeedbackGateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listForAdmin', () => {
    it('GET v3/fish/feedback/admin 并解包 data', async () => {
      mockGet.mockResolvedValue({
        data: { data: [sampleFeedback] },
      } as never);

      const result = await fishingFeedbackGateway.listForAdmin();

      expect(mockGet).toHaveBeenCalledWith('v3/fish/feedback/admin', {
        params: {
          status: undefined,
          type: undefined,
          keyword: undefined,
          page: undefined,
          page_size: undefined,
        },
      });
      expect(result).toEqual([sampleFeedback]);
    });

    it('带上状态、类型与关键词过滤', async () => {
      mockGet.mockResolvedValue({
        data: { data: [sampleFeedback] },
      } as never);

      const result = await fishingFeedbackGateway.listForAdmin({
        status: 'pending',
        type: 'fee_wrong',
        keyword: '雁田',
        page: 1,
        page_size: 20,
      });

      expect(mockGet).toHaveBeenCalledWith('v3/fish/feedback/admin', {
        params: expect.objectContaining({
          status: 'pending',
          type: 'fee_wrong',
          keyword: '雁田',
          page: 1,
          page_size: 20,
        }),
      });
      expect(result).toEqual([sampleFeedback]);
    });
  });

  describe('updateStatus', () => {
    it('PUT v3/fish/feedback/:id/status 携带 status 与 note', async () => {
      mockPut.mockResolvedValue({ data: { data: null } } as never);

      await fishingFeedbackGateway.updateStatus('f3a', {
        status: 'dismissed',
        note: '现场核实过，仍按免费开放',
      });

      expect(mockPut).toHaveBeenCalledWith('v3/fish/feedback/f3a/status', {
        status: 'dismissed',
        note: '现场核实过，仍按免费开放',
      });
    });

    it('采纳时只带 status', async () => {
      mockPut.mockResolvedValue({ data: { data: null } } as never);

      await fishingFeedbackGateway.updateStatus('f3a', {
        status: 'accepted',
      });

      expect(mockPut).toHaveBeenCalledWith('v3/fish/feedback/f3a/status', {
        status: 'accepted',
      });
    });
  });
});
