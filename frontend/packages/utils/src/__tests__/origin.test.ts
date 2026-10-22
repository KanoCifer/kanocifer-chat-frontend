import { describe, it, expect } from 'vitest';
import { mediaUrl } from '../origin';

/**
 * mediaUrl —— 存储相对路径 → 可加载的绝对媒体地址。
 *
 * 后端返回的钓点图片是相对路径（gallery/19/xxx.jpg），不进 media 路由
 * 就是 404；这里锁住前缀拼接规则。
 */
describe('mediaUrl', () => {
  const API_ORIGIN = window.location.origin;

  it('空字符串原样返回', () => {
    expect(mediaUrl('')).toBe('');
  });

  it('相对路径补上 media 前缀', () => {
    expect(mediaUrl('gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('带前导斜杠的相对路径不会拼出双斜杠', () => {
    expect(mediaUrl('/gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('绝对 URL 原样返回', () => {
    const url = 'https://api.kanocifer.chat/api/v1/media/gallery/1/abc.jpeg';
    expect(mediaUrl(url)).toBe(url);
  });

  it('已带 v3/media 前缀的路径不重复拼前缀', () => {
    expect(mediaUrl('v3/media/gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('老路由 api/v1/media 前缀只补 origin', () => {
    expect(mediaUrl('api/v1/media/gallery/1/abc.jpeg')).toBe(
      `${API_ORIGIN}/api/v1/media/gallery/1/abc.jpeg`,
    );
  });
});
