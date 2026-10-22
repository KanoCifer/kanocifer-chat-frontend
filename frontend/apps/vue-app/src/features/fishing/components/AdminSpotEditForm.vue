<script setup lang="ts">
/**
 * AdminSpotEditForm —— 管理后台的钓点纠错表单（就地编辑，不开弹窗）。
 *
 * 复用 useSpotEditor 的 edit 模式：图片上传那套 pipeline（校验 → 预览 →
 * 自动上传 → 失败重试）是整块复杂逻辑，重写一遍只会得到一个行为不一致的孪生体。
 *
 * 与 SpotDetailPanel（属主编辑）刻意不同的两处：
 * 1. **坐标只读** —— 把钓点挪到另一个位置是内容纠错里最重的一档，第一版不做：
 *    坐标一改，钓鱼指数、潮汐的就近取数全都跟着变，改坏了比不改更难收拾。
 * 2. **不传 rating** —— 评分是用户投票的均值，管理员改它等于往公开列表里
 *    掺一条假数据。审核与纠错都不该碰这个字段。
 *
 * 为什么是「表单」而不是「弹窗」：审核台是连续作业 —— 改完一条要接着看下一条。
 * 弹窗会把队列挤出视野，改完还得关窗、找回位置；就地改则队列一直在左边。
 * 保存/取消按钮由父组件的行动条统一持有（它们要钉在窗口底部），
 * 所以这里只出字段，并通过 defineExpose 把 canSave / save 交出去。
 */
import { useSpotEditor } from '@/features/fishing/composables';
import { fishingSpotsGateway } from '@readinglist/api';
import { mediaPath, mediaUrl } from '@/composables';
import { useNotificationStore } from '@/stores';
import { UploadDropzone, UploadProgress } from '@/features/upload/components';
import {
  FISHING_SPOT_CAR_LABELS,
  FISHING_SPOT_FEE_LABELS,
  FISHING_SPOT_KIND_ALL_LABELS,
  FISHING_SPOT_KIND_FULLS,
  FISHING_SPOT_ROAD_LABELS,
  SPOT_MAX_PICTURES,
} from '@readinglist/types';
import type {
  FishingSpot,
  FishingSpotCarAccess,
  FishingSpotFeeType,
  FishingSpotKindFull,
  FishingSpotRoadCondition,
  UpdateFishingSpotPayload,
} from '@readinglist/types';
import { ImageOff, MapPin } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  /** 要编辑的钓点。表单随它重新挂载（父组件用 id 做 key）。 */
  spot: FishingSpot;
}>();

const emit = defineEmits<{
  /** 保存成功，回传最新的钓点数据（父组件据此刷新这一行）。 */
  (e: 'saved', spot: FishingSpot): void;
}>();

const notifier = useNotificationStore();

const editor = useSpotEditor({
  mode: 'edit',
  initial: props.spot,
});
const {
  draft,
  pictures,
  pendingError,
  isUploading,
  progress,
  canAddMore,
  removePicture,
  handleDropzoneSelect,
  startEdit,
} = editor;

// meta 那组字段不在 useSpotEditor 的草稿里 —— 它只管 name / description /
// tags / rating / kind / 图片。收费、路况这些自己在这儿存。
//
// 水体类型也自己存：useSpotEditor 的草稿里 kind 仍是筛选用的三值，
// 而后端的枚举是八值 —— 后台要能改 pond / sea 这些，用草稿那个会被类型卡住。
const kind = ref<FishingSpotKindFull | null>(null);
const address = ref('');
const feeType = ref<FishingSpotFeeType>('unknown');
const feeAmount = ref<number | null>(null);
const roadCondition = ref<FishingSpotRoadCondition>('unknown');
const carAccess = ref<FishingSpotCarAccess>('unknown');
const openingHours = ref('');
const isSaving = ref(false);

/** 从钓点快照灌入表单状态。表单每次都随新快照重新挂载，这里灌一次就够。 */
function hydrate(spot: FishingSpot): void {
  // startEdit 会把 draft 与图片按快照重派生 —— 不这么做的话，
  // 上一次编辑到一半的内容会漏进下一条。
  startEdit();
  // 后端可能发来八种类型里的任意一种（草稿那个三值类型只覆盖筛选用的），
  // 运行时按真实值接住。
  kind.value = (spot.kind as FishingSpotKindFull | null) ?? null;
  address.value = spot.address ?? '';
  feeType.value = spot.fee_type ?? 'unknown';
  feeAmount.value = spot.fee_amount ?? null;
  roadCondition.value = spot.road_condition ?? 'unknown';
  carAccess.value = spot.car_access ?? 'unknown';
  openingHours.value = spot.opening_hours ?? '';
}

hydrate(props.spot);

// 组件复用时（父组件换了 key 之外的极端情况）仍要跟着快照走。
watch(
  () => props.spot,
  (spot) => {
    hydrate(spot);
  },
);

const kindOptions = computed(() =>
  FISHING_SPOT_KIND_FULLS.map((value) => ({
    value,
    label: FISHING_SPOT_KIND_ALL_LABELS[value] ?? value,
  })),
);

const feeOptions = computed(() =>
  (Object.keys(FISHING_SPOT_FEE_LABELS) as FishingSpotFeeType[]).map(
    (value) => ({
      value,
      label: FISHING_SPOT_FEE_LABELS[value],
    }),
  ),
);

const roadOptions = computed(() =>
  (Object.keys(FISHING_SPOT_ROAD_LABELS) as FishingSpotRoadCondition[]).map(
    (value) => ({ value, label: FISHING_SPOT_ROAD_LABELS[value] }),
  ),
);

const carOptions = computed(() =>
  (Object.keys(FISHING_SPOT_CAR_LABELS) as FishingSpotCarAccess[]).map(
    (value) => ({
      value,
      label: FISHING_SPOT_CAR_LABELS[value],
    }),
  ),
);

/** 收费选了「收费」才要金额 —— 其余情况把金额清掉，别留个孤儿数字。 */
watch(feeType, (value) => {
  if (value !== 'paid') feeAmount.value = null;
});

const canSave = computed(
  () =>
    !isSaving.value &&
    draft.value.name.trim().length > 0 &&
    // 收费却没填金额 —— 这一栏在收费状态下是必填的
    !(feeType.value === 'paid' && !feeAmount.value) &&
    !isUploading.value,
);

/**
 * 组装保存载荷。
 *
 * `tags` / `images` 必传 —— 后端对这两组字段是**整组替换**语义
 * （nil = 不动，数组 = 整组换掉）。只改名字却漏传它们，等于把标签和照片清空。
 * 其余字段也一并全传：表单里看到的就是要存下的，不做「哪些变了」的推断。
 *
 * `location` 与 `rating` 刻意不传 —— 坐标只读，评分不该由管理员改。
 */
function buildUpdate(): UpdateFishingSpotPayload {
  const payload: UpdateFishingSpotPayload = {
    name: draft.value.name.trim(),
    description: draft.value.description.trim(),
    kind: kind.value ?? undefined,
    tags: draft.value.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    images: pictures.value.map((p) => mediaPath(p.url)),
    address: address.value.trim(),
    fee_type: feeType.value,
    road_condition: roadCondition.value,
    car_access: carAccess.value,
    opening_hours: openingHours.value.trim(),
  };

  /*
   * 收费金额只在「收费」状态下传。
   *
   * 改成免费/未知时**不传**它：后端在 fee_type 不是 paid 时会把金额一起清掉
   * （FeeAmount 是 *float64，JSON 的 null 解出来是 nil，而 nil 在部分更新里
   * 表示「不动」—— 靠前端传 null 是清不掉金额的）。
   */
  if (feeType.value === 'paid') {
    payload.fee_amount = feeAmount.value;
  }
  return payload;
}

async function save(): Promise<void> {
  const spot = props.spot;
  if (!spot || !canSave.value) return;
  isSaving.value = true;
  try {
    const payload = buildUpdate();
    await fishingSpotsGateway.update(spot.id, payload);
    notifier.success('钓点已更新');
    // 回传拼好的快照，父组件据此就地更新这一行。
    // fee_amount 归一一次：改成免费时载荷里没有这个键，直接展开会留着旧金额，
    // 与服务端已经清空的事实对不上。
    emit('saved', {
      ...spot,
      ...payload,
      fee_amount: payload.fee_amount ?? null,
    } as FishingSpot);
  } catch (error) {
    notifier.error(
      error instanceof Error ? error.message : '保存失败，请稍后重试',
    );
  } finally {
    isSaving.value = false;
  }
}

defineExpose({ canSave, save, isSaving });
</script>

<template>
  <div class="space-y-5">
    <p class="text-muted text-xs">
      管理员修改不会改变审核状态 —— 审核与纠错是两条独立的动作。
    </p>

    <!-- 基本信息 -->
    <div class="space-y-3">
      <label class="block space-y-1">
        <span class="text-muted text-xs">名称</span>
        <input
          v-model="draft.name"
          type="text"
          placeholder="钓点名称"
          class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
        />
      </label>

      <label class="block space-y-1">
        <span class="text-muted text-xs">描述</span>
        <textarea
          v-model="draft.description"
          rows="3"
          placeholder="环境、钓法、注意事项…"
          class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
        />
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1">
          <span class="text-muted text-xs">水体类型</span>
          <select
            v-model="kind"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
          >
            <option :value="null">未分类</option>
            <option
              v-for="option in kindOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="block space-y-1">
          <span class="text-muted text-xs">标签（逗号分隔）</span>
          <input
            v-model="draft.tags"
            type="text"
            placeholder="水库, 免费, 路好"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
          />
        </label>
      </div>

      <label class="block space-y-1">
        <span class="text-muted text-xs">文字地址</span>
        <input
          v-model="address"
          type="text"
          placeholder="广东省东莞市大松园路"
          class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
        />
      </label>
    </div>

    <!-- 钓点信息 -->
    <fieldset class="space-y-3">
      <legend class="text-muted text-xs tracking-wide uppercase">
        钓点信息
      </legend>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1">
          <span class="text-muted text-xs">收费</span>
          <select
            v-model="feeType"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
          >
            <option
              v-for="option in feeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="block space-y-1">
          <span class="text-muted text-xs">收费金额（元）</span>
          <input
            v-model.number="feeAmount"
            type="number"
            min="0"
            :disabled="feeType !== 'paid'"
            placeholder="30"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none disabled:opacity-50"
          />
          <!-- 收费状态下金额是必填的：缺了它，保存按钮是灰的，得说清为什么 -->
          <span
            v-if="feeType === 'paid' && !feeAmount"
            class="text-destructive text-xs"
          >
            填一下收费金额
          </span>
        </label>

        <label class="block space-y-1">
          <span class="text-muted text-xs">道路情况</span>
          <select
            v-model="roadCondition"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
          >
            <option
              v-for="option in roadOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="block space-y-1">
          <span class="text-muted text-xs">能否车到水边</span>
          <select
            v-model="carAccess"
            class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
          >
            <option
              v-for="option in carOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <label class="block space-y-1">
        <span class="text-muted text-xs">开放时间</span>
        <input
          v-model="openingHours"
          type="text"
          placeholder="全天 / 06:00-18:00"
          class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
        />
      </label>
    </fieldset>

    <!-- 坐标：只读 -->
    <div class="bg-secondary/50 ring-border/60 space-y-1 rounded-xl p-3 ring-1">
      <span class="text-muted flex items-center gap-1.5 text-xs">
        <MapPin :size="14" />
        坐标（只读）
      </span>
      <p class="text-sm tabular-nums">
        {{ spot.location[0].toFixed(4) }}, {{ spot.location[1].toFixed(4) }}
      </p>
      <p class="text-muted text-xs">
        管理员暂不能挪动钓点 —— 坐标一变，附近的天气与潮汐取数都会跟着变。
      </p>
    </div>

    <!-- 照片 -->
    <div class="space-y-2">
      <span class="text-muted text-xs">
        照片（{{ pictures.length }} / {{ SPOT_MAX_PICTURES }}）
      </span>

      <div v-if="pictures.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <div
          v-for="picture in pictures"
          :key="picture.id"
          class="group relative overflow-hidden rounded-lg"
        >
          <img
            :src="mediaUrl(picture.url)"
            alt=""
            class="h-20 w-full object-cover"
          />
          <button
            type="button"
            class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="移除这张照片"
            @click="removePicture(picture)"
          >
            <ImageOff :size="12" />
          </button>
        </div>
      </div>

      <UploadDropzone
        v-if="canAddMore"
        accept="image/*"
        :disabled="isUploading"
        prompt="点击或拖拽上传照片"
        hint="单张不超过 5MB，最多 9 张"
        @select="handleDropzoneSelect"
      />

      <UploadProgress v-if="isUploading" :progress="progress" />

      <p v-if="pendingError" class="text-destructive text-xs">
        {{ pendingError }}
      </p>
    </div>
  </div>
</template>
