import { describe, it, expect } from 'vitest';
import { mediaUrl, mediaPath } from '../origin';

/**
 * mediaUrl / mediaPath —— 媒体路径归一化。
 *
 * 背景：后端 upload 返回的 url 带 `v3/media/` 前缀，序列化时又可能拼一次，
 * 于是出现 `v3/media/v3/media/gallery/1/x.jpg` 这种叠层。前端不再「补前缀」，
 * 一律先剥到裸路径，再统一拼一层。
 */
describe('mediaUrl', () => {
  const API_ORIGIN = window.location.origin;

  it('空字符串原样返回', () => {
    expect(mediaUrl('')).toBe('');
  });

  it('裸相对路径补一层 media 前缀', () => {
    expect(mediaUrl('gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('带前导斜杠的相对路径不会拼出双斜杠', () => {
    expect(mediaUrl('/gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('已带 media 前缀的路径不重复拼', () => {
    expect(mediaUrl('v3/media/gallery/19/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/19/abc.jpg`,
    );
  });

  it('叠了两层 media 前缀也收敛成一层', () => {
    expect(mediaUrl('v3/media/v3/media/gallery/1/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/1/abc.jpg`,
    );
  });

  it('老路由 api/v1/media 前缀同样归一', () => {
    expect(mediaUrl('api/v1/media/gallery/1/abc.jpeg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/1/abc.jpeg`,
    );
  });

  it('绝对 URL 归一到当前 API 域的 media 路由', () => {
    expect(mediaUrl('https://api.kanocifer.chat/v3/media/gallery/1/abc.jpg')).toBe(
      `${API_ORIGIN}/v3/media/gallery/1/abc.jpg`,
    );
  });

  it('外部图床的绝对 URL 原样返回', () => {
    const url = 'https://img.example.com/a.jpg';
    expect(mediaUrl(url)).toBe(url);
  });
});

describe('mediaPath', () => {
  it('空字符串原样返回', () => {
    expect(mediaPath('')).toBe('');
  });

  it('裸相对路径原样返回', () => {
    expect(mediaPath('gallery/1/abc.jpg')).toBe('gallery/1/abc.jpg');
  });

  it('剥掉 media 前缀', () => {
    expect(mediaPath('/v3/media/gallery/1/abc.jpg')).toBe(
      'gallery/1/abc.jpg',
    );
  });

  it('剥掉叠层 media 前缀', () => {
    expect(mediaPath('v3/media/v3/media/gallery/1/abc.jpg')).toBe(
      'gallery/1/abc.jpg',
    );
  });

  it('绝对 URL 只留裸路径', () => {
    expect(
      mediaPath('https://api.kanocifer.chat/v3/media/gallery/1/abc.jpg'),
    ).toBe('gallery/1/abc.jpg');
  });

  it('外部图床的绝对 URL 原样保留', () => {
    const url = 'https://img.example.com/a.jpg';
    expect(mediaPath(url)).toBe(url);
  });
});
