// 钓鱼 / 天气网关 —— 真源 @readinglist/api
export { fishingGateway } from '@readinglist/api';
export type { FishingGateway } from '@readinglist/api';
export { fishingSpotsGateway } from '@readinglist/api';
export type {
  FishingSpotGateway,
  DeleteFishingSpotOptions,
} from '@readinglist/api';
export { fishingFeedbackGateway } from '@readinglist/api';
export type { FishingFeedbackGateway } from '@readinglist/api';

// 钓点 / 天气领域类型 —— 真源在 @readinglist/types
export type {
  CreateFishingSpotPayload,
  FishingSpot,
  FishingSpotFeedback,
  FishingSpotFeedbackActionStatus,
  FishingSpotFeedbackAdminListQuery,
  FishingSpotFeedbackReporter,
  FishingSpotFeedbackStatus,
  FishingSpotFeedbackStatusPayload,
  FishingSpotFeedbackType,
  TideResponse,
  UpdateFishingSpotPayload,
  WeatherDay,
  WeatherFullResponse,
  WeatherNow,
} from '@readinglist/types';
