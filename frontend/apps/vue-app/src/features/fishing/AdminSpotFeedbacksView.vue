<script setup lang="ts">
/**
 * AdminSpotFeedbacksView —— 管理后台的钓点纠错反馈队列。
 *
 * 反馈是这个域里**唯一**的线索来源：用户报「位置不对」「收费变了」，
 * 但后端刻意不自动改钓点 —— 改钓点本身仍然在「钓点审核」视图里做。
 * 所以本页只做两件事：把队列摊开给管理员看，以及给这条反馈一个结论
 * （已采纳 / 已处理 / 不属实）。
 *
 * 布局沿用 AdminFishingSpotsView 的主从分栏：左边队列，右边这一条的详情。
 * 反馈一条条来，队列永远在视线里，处理完自动落到下一条 —— 位置不丢。
 *
 * 修正值对比是本页的核心：用户说「现在是收费 30 元」，而这条钓点页面上
 * 仍写着免费 —— 不把两边摆在一起，管理员没法判断这条反馈值不值得处理。
 * 页面现状要现取（GET /v3/fish/spots/:id），反馈本身不带钓点当前值。
 */
import { fishingFeedbackGateway, fishingSpotsGateway } from '@readinglist/api';
import { mediaUrl } from '@/composables';
import { useNotificationStore } from '@/stores';
import { Button } from '@/components';
import { formatRelative } from '@/lib/dayjs';
import {
  FISHING_SPOT_FEE_LABELS,
  FISHING_SPOT_FEEDBACK_STATUS_LABELS,
  FISHING_SPOT_FEEDBACK_TYPE_LABELS,
  fishingSpotFeedbackNextStatuses,
} from '@readinglist/types';
import type {
  FishingSpot,
  FishingSpotFeedback,
  FishingSpotFeedbackActionStatus,
  FishingSpotFeedbackStatus,
  FishingSpotFeedbackType,
} from '@readinglist/types';
import {
  ArrowRight,
  ImageOff,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

/** 状态筛选 —— '' 表示全部状态。 */
type StatusFilter = FishingSpotFeedbackStatus | '';

/** 类型筛选 —— '' 表示全部类型。 */
type TypeFilter = FishingSpotFeedbackType | '';

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'accepted', label: '已采纳' },
  { value: 'resolved', label: '已处理' },
  { value: 'dismissed', label: '不属实' },
];

/** 类型下拉的选项 —— label 取自 @readinglist/types，不在组件里另抄一份。 */
const TYPE_OPTIONS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: '', label: '全部类型' },
  ...Object.entries(FISHING_SPOT_FEEDBACK_TYPE_LABELS).map(
    ([value, label]) =>
      ({ value, label }) as { value: TypeFilter; label: string },
  ),
];

const notifier = useNotificationStore();
const router = useRouter();

const statusFilter = ref<StatusFilter>('pending');
const typeFilter = ref<TypeFilter>('');
const keyword = ref('');

const feedbacks = ref<FishingSpotFeedback[]>([]);
const selectedId = ref<string | null>(null);
const page = ref(1);
const pageSize = 20;
const isLoading = ref(false);
const loadError = ref<string | null>(null);

/** 正在提交的处理动作 —— 按住它是为了让按钮进入 loading。 */
const acting = ref(false);

/** 「不属实」的理由就地输入区。 */
const isDismissing = ref(false);

/**
 * 处理备注的输入区 —— 采纳 / 已处理 / 不属实共用这一个框。
 *
 * 「不属实」时必填（后端会拦），其余状态选填；
 * 选填且留空时沿用反馈上已有的那条备注。
 */
const actionNote = ref('');

/** 当前这条反馈对应的钓点档案 —— 用来做修正值对比。 */
const currentSpot = ref<FishingSpot | null>(null);
const isSpotLoading = ref(false);
const spotError = ref<string | null>(null);

// ── 取数 ────────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    feedbacks.value = await fishingFeedbackGateway.listForAdmin({
      status: statusFilter.value || undefined,
      type: typeFilter.value || undefined,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      page_size: pageSize,
    });
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : '加载失败，请稍后重试';
  } finally {
    isLoading.value = false;
  }
}

const selected = computed(
  () =>
    feedbacks.value.find((feedback) => feedback.id === selectedId.value) ??
    null,
);

/** 队列永远有落点：当前页换了内容后，选中项没了就落到第一条。 */
watch(
  feedbacks,
  (list) => {
    if (!list.length) {
      selectedId.value = null;
      return;
    }
    if (!list.some((feedback) => feedback.id === selectedId.value)) {
      selectedId.value = list[0].id;
    }
  },
  { immediate: true },
);

/** 选中项变了就换钓点档案 —— 修正值对比的「页面现状」那一栏。 */
watch(selectedId, async (id) => {
  currentSpot.value = null;
  spotError.value = null;
  const feedback = feedbacks.value.find((item) => item.id === id);
  if (!feedback) return;
  isSpotLoading.value = true;
  try {
    currentSpot.value = await fishingSpotsGateway.getByID(feedback.spot_id);
  } catch (error) {
    spotError.value =
      error instanceof Error ? error.message : '钓点档案加载失败';
  } finally {
    isSpotLoading.value = false;
  }
});

function switchStatus(next: StatusFilter): void {
  if (statusFilter.value === next) return;
  statusFilter.value = next;
  page.value = 1;
  void load();
}

function switchType(next: TypeFilter): void {
  typeFilter.value = next;
  page.value = 1;
  void load();
}

/**
 * 类型下拉的 change 事件。
 *
 * 不用 v-model：值从事件里取，不靠「v-model 的监听器先跑」这种隐含顺序。
 */
function onTypeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? '';
  switchType(value as TypeFilter);
}

function search(): void {
  page.value = 1;
  void load();
}

function goToPage(next: number): void {
  if (next < 1) return;
  page.value = next;
  void load();
}

/** 末页不满一页就是没有下一页 —— 后端没给总数，用条数反推。 */
const hasNextPage = computed(() => feedbacks.value.length >= pageSize);

function select(id: string): void {
  selectedId.value = id;
}

/**
 * 换一条反馈，输入区就回到空白。
 *
 * 备注不该从上一条漏到下一条 —— 上一页写的判断是关于上一页的。
 */
watch(selectedId, () => {
  isDismissing.value = false;
  actionNote.value = '';
});

function moveSelection(delta: number): void {
  const list = feedbacks.value;
  if (!list.length) return;
  const index = list.findIndex((feedback) => feedback.id === selectedId.value);
  const next = Math.min(
    list.length - 1,
    Math.max(0, (index < 0 ? 0 : index) + delta),
  );
  selectedId.value = list[next].id;
}

// ── 处理动作 ────────────────────────────────────────────────────────────

/** 当前这条还能走的动作 —— 终态返回空数组，后端也认不了别的流转。 */
const availableActions = computed<FishingSpotFeedbackActionStatus[]>(() =>
  selected.value
    ? [...fishingSpotFeedbackNextStatuses(selected.value.status)]
    : [],
);

/**
 * 处理一条反馈。
 *
 * 只发后端允许的目标状态；「不属实」必须带理由（后端会拦，返 400）。
 * 采纳 / 已处理的备注是选填的：写了就覆盖，留空就沿用已有的那条 ——
 * 后端是整列覆盖，发了空串就把管理员上次写的判断抹掉了。
 */
async function applyStatus(
  next: FishingSpotFeedbackActionStatus,
): Promise<void> {
  const feedback = selected.value;
  if (!feedback || acting.value) return;
  const note = actionNote.value.trim();
  if (next === 'dismissed' && !note) return;

  const list = feedbacks.value;
  const index = list.findIndex((item) => item.id === feedback.id);
  const nextId = list[index + 1]?.id ?? list[index - 1]?.id ?? null;

  acting.value = true;
  try {
    await fishingFeedbackGateway.updateStatus(feedback.id, {
      status: next,
      note: next === 'dismissed' ? note : note || feedback.review_note || '',
    });
    notifier.success(
      next === 'dismissed'
        ? '已标记为不属实'
        : next === 'accepted'
          ? '已采纳'
          : '已处理',
    );
    isDismissing.value = false;
    actionNote.value = '';
    await load();
    // 处理完落到下一条 —— 队列顺序不变，管理员的视线跟着走。
    if (nextId && feedbacks.value.some((item) => item.id === nextId)) {
      selectedId.value = nextId;
    }
  } catch (error) {
    notifier.error(
      error instanceof Error ? error.message : '操作失败，请稍后重试',
    );
  } finally {
    acting.value = false;
  }
}

// ── 键盘 ────────────────────────────────────────────────────────────────

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
      target.isContentEditable)
  ) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'j') {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === 'k') {
    event.preventDefault();
    moveSelection(-1);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void load();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

// ── 展示helpers ─────────────────────────────────────────────────────────

/**
 * 状态徽章的配色。
 *
 * 只用主题里已有的语义 token：待处理走 accent（唯一的有彩色，正等人看），
 * 已采纳走 success（属实、待落地），已处理走中性灰（已经办完的事不该再抢眼睛），
 * 不属实走 rose。
 */
function statusToneClass(status: FishingSpotFeedbackStatus): string {
  switch (status) {
    case 'accepted':
      return 'bg-success/12 text-success';
    case 'resolved':
      return 'bg-secondary text-muted';
    case 'dismissed':
      return 'bg-destructive/12 text-destructive';
    default:
      return 'bg-accent/12 text-accent';
  }
}

function statusDotClass(status: FishingSpotFeedbackStatus): string {
  switch (status) {
    case 'accepted':
      return 'bg-success';
    case 'resolved':
      return 'bg-muted/50';
    case 'dismissed':
      return 'bg-destructive';
    default:
      return 'bg-accent';
  }
}

function statusOf(feedback: FishingSpotFeedback): FishingSpotFeedbackStatus {
  return feedback.status ?? 'pending';
}

/** 钓点当前收费 —— 与钓点审核视图同一套写法。 */
function spotFeeText(spot: FishingSpot | null): string {
  if (!spot) return '—';
  if (spot.fee_type === 'paid') return `¥${spot.fee_amount ?? '?'} / 人`;
  return FISHING_SPOT_FEE_LABELS[spot.fee_type ?? 'unknown'] ?? '未知';
}

/** 用户声称的收费。 */
function claimedFeeText(feedback: FishingSpotFeedback): string {
  const type = feedback.corrected_fee_type;
  if (!type) return '—';
  if (type === 'paid') return `¥${feedback.corrected_fee_amount ?? '?'} / 人`;
  return FISHING_SPOT_FEE_LABELS[type] ?? '未知';
}

/** 一行修正值对比：页面现状 vs 用户反馈。 */
interface ComparisonRow {
  label: string;
  current: string;
  claimed: string;
}

const comparisonRows = computed<ComparisonRow[]>(() => {
  const feedback = selected.value;
  if (!feedback) return [];
  const spot = currentSpot.value;
  const rows: ComparisonRow[] = [];

  if (feedback.corrected_name) {
    rows.push({
      label: '名称',
      current: spot?.name ?? '—',
      claimed: feedback.corrected_name,
    });
  }

  if (feedback.corrected_fee_type) {
    rows.push({
      label: '收费',
      current: spotFeeText(spot),
      claimed: claimedFeeText(feedback),
    });
  }

  if (
    feedback.corrected_longitude != null &&
    feedback.corrected_latitude != null
  ) {
    rows.push({
      label: '坐标',
      current: spot
        ? `${spot.location[0].toFixed(4)}, ${spot.location[1].toFixed(4)}`
        : '—',
      claimed: `${feedback.corrected_longitude.toFixed(4)}, ${feedback.corrected_latitude.toFixed(4)}`,
    });
  }

  return rows;
});

/** 去钓点审核视图 —— 改钓点本身在那儿做，这里只给个入口。 */
function goToSpotReview(): void {
  const feedback = selected.value;
  if (!feedback) return;
  void router.push({
    path: '/admin/fishing-spots',
    query: { spot: feedback.spot_id },
  });
}
</script>

<template>
  <div class="bg-page text-ink min-h-full">
    <!-- pt-24：全站顶栏是浮动的（layout 的 BasicNav，fixed top-12），
         内容要从它下面开始，别被压住。 -->
    <div class="mx-auto flex w-full max-w-[1400px] flex-col px-6 pt-24 pb-8">
      <!-- 页头 -->
      <header class="flex flex-wrap items-end gap-4 pb-6">
        <div class="space-y-1">
          <p class="text-muted text-xs tracking-[0.25em] uppercase">Admin</p>
          <h1 class="font-serif text-2xl font-semibold tracking-tight">
            钓点纠错反馈
          </h1>
          <p class="text-muted text-sm">
            用户报的问题在这里排队。反馈只是线索 ——
            改钓点本身在「钓点审核」里做。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="ml-auto"
          :disabled="isLoading"
          @click="load"
        >
          <RefreshCw :size="16" class="mr-1.5" />
          刷新
        </Button>
      </header>

      <div
        class="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]"
      >
        <!-- 队列 -->
        <section class="space-y-3">
          <div
            class="ring-border/60 bg-card flex flex-wrap items-center gap-2 rounded-2xl p-3 ring-1"
          >
            <div
              role="radiogroup"
              aria-label="处理状态"
              class="bg-muted/70 ring-border/60 inline-flex items-center gap-1 rounded-full p-0.5 ring-1"
            >
              <button
                v-for="tab in STATUS_TABS"
                :key="tab.value"
                type="button"
                role="radio"
                :aria-checked="statusFilter === tab.value"
                class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  statusFilter === tab.value
                    ? 'bg-accent text-contrast shadow-sm'
                    : 'text-muted hover:bg-surface hover:text-ink'
                "
                @click="switchStatus(tab.value)"
              >
                {{ tab.label }}
              </button>
            </div>

            <form class="flex items-center gap-2" @submit.prevent="search">
              <label class="relative flex min-w-0 flex-1 items-center">
                <Search
                  :size="14"
                  class="text-muted pointer-events-none absolute left-2.5"
                />
                <input
                  v-model="keyword"
                  type="search"
                  placeholder="搜钓点名 / 反馈正文"
                  class="bg-surface text-ink ring-border/60 w-full rounded-lg py-1.5 pr-3 pl-8 text-sm ring-1 focus:ring-2 focus:outline-none"
                />
              </label>
              <Button variant="outline" size="sm" type="submit">搜索</Button>
            </form>

            <select
              :value="typeFilter"
              aria-label="反馈类型"
              class="bg-surface text-ink ring-border/60 rounded-lg px-2 py-1.5 text-sm ring-1 focus:ring-2 focus:outline-none"
              @change="onTypeChange"
            >
              <option
                v-for="option in TYPE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <p v-if="loadError" class="text-destructive text-sm">
            {{ loadError }}
          </p>

          <p
            v-else-if="isLoading && !feedbacks.length"
            class="text-muted flex items-center gap-2 text-sm"
          >
            <Loader2 :size="16" class="animate-spin" />
            加载中…
          </p>

          <ul class="space-y-1.5">
            <li v-for="feedback in feedbacks" :key="feedback.id">
              <button
                type="button"
                class="ring-border/60 w-full rounded-xl px-3 py-2.5 text-left ring-1 transition-all duration-200"
                :class="
                  feedback.id === selectedId
                    ? 'bg-card ring-accent/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                    : 'hover:bg-card/60'
                "
                @click="select(feedback.id)"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="statusDotClass(statusOf(feedback))"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm font-medium"
                    :class="
                      feedback.id === selectedId ? 'text-ink' : 'text-ink/85'
                    "
                  >
                    {{ feedback.spot_name }}
                  </span>
                  <span class="text-muted shrink-0 text-xs tabular-nums">
                    {{ formatRelative(feedback.created_at) }}
                  </span>
                </span>
                <span
                  class="text-muted mt-1 flex items-center gap-2 pl-3.5 text-xs"
                >
                  <span>
                    {{
                      FISHING_SPOT_FEEDBACK_TYPE_LABELS[feedback.type] ?? '其他'
                    }}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span class="truncate">
                    {{ feedback.reporter?.name ?? '匿名' }}
                  </span>
                  <span
                    class="ml-auto shrink-0 rounded-full px-1.5 py-0.5"
                    :class="statusToneClass(statusOf(feedback))"
                  >
                    {{
                      FISHING_SPOT_FEEDBACK_STATUS_LABELS[statusOf(feedback)]
                    }}
                  </span>
                </span>
              </button>
            </li>

            <li
              v-if="!feedbacks.length && !isLoading && !loadError"
              class="ring-border/60 bg-card text-muted rounded-xl px-4 py-8 text-center text-sm ring-1"
            >
              这个筛选下没有反馈。
            </li>
          </ul>

          <!-- 分页 -->
          <div
            v-if="feedbacks.length"
            class="flex items-center justify-between gap-2 px-1"
          >
            <Button
              variant="outline"
              size="sm"
              :disabled="page <= 1 || isLoading"
              @click="goToPage(page - 1)"
            >
              上一页
            </Button>
            <span class="text-muted text-xs tabular-nums"
              >第 {{ page }} 页</span
            >
            <Button
              variant="outline"
              size="sm"
              :disabled="!hasNextPage || isLoading"
              @click="goToPage(page + 1)"
            >
              下一页
            </Button>
          </div>

          <p class="text-muted px-1 text-xs">
            键盘：<kbd class="ring-border/60 rounded px-1 ring-1">J</kbd> /
            <kbd class="ring-border/60 rounded px-1 ring-1">K</kbd>
            上下移动 · 已处理 / 不属实是终态，不再出处理按钮
          </p>
        </section>

        <!-- 详情：定高 + sticky —— 右栏是工作台，不随内容长高；
             内容在卡内滚，行动条永远钉在卡底，队列在左侧照常滚页面。 -->
        <section
          class="ring-border/60 bg-card sticky top-24 flex h-[calc(100vh_-_13rem)] min-h-[520px] flex-col rounded-2xl ring-1"
        >
          <template v-if="selected">
            <!-- 配图 -->
            <div class="flex gap-2 overflow-x-auto p-4 pb-0">
              <div
                v-for="image in selected.images"
                :key="image"
                class="h-28 w-40 shrink-0 overflow-hidden rounded-xl"
              >
                <img
                  :src="mediaUrl(image)"
                  alt=""
                  class="h-full w-full object-cover"
                />
              </div>
              <div
                v-if="!selected.images.length"
                class="text-muted ring-border/60 ring-dashed flex h-28 w-40 shrink-0 items-center justify-center gap-2 rounded-xl text-xs ring-1"
              >
                <ImageOff :size="14" />
                没有配图
              </div>
            </div>

            <div class="flex-1 space-y-5 overflow-y-auto p-5">
              <!-- 标题区 -->
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="statusToneClass(statusOf(selected))"
                  >
                    {{
                      FISHING_SPOT_FEEDBACK_STATUS_LABELS[statusOf(selected)]
                    }}
                  </span>
                  <span
                    class="bg-muted/60 text-muted rounded-full px-2 py-0.5 text-xs"
                  >
                    {{
                      FISHING_SPOT_FEEDBACK_TYPE_LABELS[selected.type] ?? '其他'
                    }}
                  </span>
                  <span class="text-muted ml-auto text-xs tabular-nums">
                    提交于 {{ formatRelative(selected.created_at) }}
                  </span>
                </div>

                <h2 class="font-serif text-xl font-semibold tracking-tight">
                  {{ selected.spot_name }}
                </h2>
              </div>

              <!-- 用户写的说明 -->
              <p class="text-ink/85 text-sm leading-relaxed">
                {{ selected.description }}
              </p>

              <!-- 提交人 -->
              <div
                class="bg-secondary/50 ring-border/60 flex items-center gap-3 rounded-xl p-3 ring-1"
              >
                <img
                  v-if="selected.reporter?.avatar"
                  :src="mediaUrl(selected.reporter.avatar)"
                  alt=""
                  class="size-9 shrink-0 rounded-full object-cover"
                />
                <span
                  v-else
                  class="bg-accent/12 text-accent flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                >
                  {{ selected.reporter?.name?.charAt(0) ?? '?' }}
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {{ selected.reporter?.name ?? '匿名投稿' }}
                  </p>
                  <p class="text-muted text-xs tabular-nums">
                    uid {{ selected.reporter?.user_id ?? '—' }} · 提交于
                    {{ formatRelative(selected.created_at) }}
                  </p>
                </div>
              </div>

              <!-- 修正值对比：用户说的 vs 页面现状 -->
              <div class="ring-border/60 space-y-2 rounded-xl p-3 ring-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">修正值对比</p>
                  <span v-if="isSpotLoading" class="text-muted text-xs">
                    <Loader2 :size="12" class="mr-1 inline animate-spin" />
                    载入钓点档案…
                  </span>
                </div>

                <p v-if="spotError" class="text-destructive text-xs">
                  {{ spotError }}
                </p>

                <table v-if="comparisonRows.length" class="w-full text-sm">
                  <thead>
                    <tr class="text-muted text-left text-xs">
                      <th class="w-16 font-normal">项目</th>
                      <th class="font-normal">页面现状</th>
                      <th class="font-normal">用户反馈</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in comparisonRows"
                      :key="row.label"
                      class="border-border/40 border-t"
                    >
                      <td class="text-muted py-1.5 align-top text-xs">
                        {{ row.label }}
                      </td>
                      <td class="py-1.5 pr-3 align-top">
                        <span class="text-ink/85">{{ row.current }}</span>
                      </td>
                      <td class="py-1.5 align-top">
                        <span class="text-ink font-medium">{{
                          row.claimed
                        }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p v-else class="text-muted text-xs">
                  用户没有填具体修正值 —— 只有上面的说明。
                </p>

                <p class="text-muted text-xs">
                  钓点档案当前坐标：
                  <span class="inline-flex items-center gap-1">
                    <MapPin :size="12" />
                    <template v-if="currentSpot">
                      {{ currentSpot.location[0].toFixed(4) }},
                      {{ currentSpot.location[1].toFixed(4) }}
                    </template>
                    <template v-else>—</template>
                  </span>
                </p>
              </div>

              <!-- 处理结论 -->
              <div
                v-if="statusOf(selected) !== 'pending'"
                class="bg-secondary/50 ring-border/60 space-y-1 rounded-xl p-3 text-sm ring-1"
              >
                <p>
                  处理结论：<span class="font-medium">{{
                    FISHING_SPOT_FEEDBACK_STATUS_LABELS[statusOf(selected)]
                  }}</span>
                </p>
                <p v-if="selected.review_note" class="text-ink/85">
                  处理备注：{{ selected.review_note }}
                </p>
                <p v-if="selected.reviewed_at" class="text-muted text-xs">
                  处理于 {{ formatRelative(selected.reviewed_at) }}
                </p>
              </div>
            </div>

            <!-- 行动条 -->
            <div class="border-border/40 border-t p-4">
              <!-- 处理备注（选填） -->
              <div
                v-if="availableActions.length && !isDismissing"
                class="bg-secondary/50 ring-border/60 mb-3 space-y-2 rounded-xl p-3 ring-1"
              >
                <p class="text-muted text-xs">
                  处理备注（选填）—— 写一句判断依据，比如「已电话核实，收费确实是 30 元」。
                  留空则沿用这条反馈已有的备注。
                </p>
                <textarea
                  v-model="actionNote"
                  rows="2"
                  placeholder="例如：已核实收费，现场改成 30 元/人"
                  class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
                />
              </div>

              <!-- 不属实的理由 -->
              <div
                v-if="isDismissing"
                class="bg-secondary/50 ring-border/60 mb-3 space-y-2 rounded-xl p-3 ring-1"
              >
                <p class="text-muted text-xs">
                  判不属实必须写理由 ——
                  没有理由的否定，提交者无从判断自己错在哪。
                </p>
                <textarea
                  v-model="actionNote"
                  rows="3"
                  placeholder="例如：现场核实过，该钓点仍按免费开放"
                  class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
                />
                <div class="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="isDismissing = false"
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    :disabled="!actionNote.trim() || acting"
                    @click="applyStatus('dismissed')"
                  >
                    <Loader2
                      v-if="acting"
                      :size="14"
                      class="mr-1.5 animate-spin"
                    />
                    确认不属实
                  </Button>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="mr-auto"
                  :disabled="acting"
                  @click="goToSpotReview"
                >
                  去钓点审核
                  <ArrowRight :size="14" class="ml-1.5" />
                </Button>

                <template v-if="availableActions.length">
                  <Button
                    v-if="availableActions.includes('accepted')"
                    size="sm"
                    :disabled="acting"
                    @click="applyStatus('accepted')"
                  >
                    <Loader2
                      v-if="acting"
                      :size="14"
                      class="mr-1.5 animate-spin"
                    />
                    已采纳
                  </Button>
                  <Button
                    v-if="availableActions.includes('resolved')"
                    variant="outline"
                    size="sm"
                    :disabled="acting"
                    @click="applyStatus('resolved')"
                  >
                    <Loader2
                      v-if="acting"
                      :size="14"
                      class="mr-1.5 animate-spin"
                    />
                    已处理
                  </Button>
                  <Button
                    v-if="availableActions.includes('dismissed')"
                    variant="outline"
                    size="sm"
                    :disabled="acting"
                    @click="isDismissing = !isDismissing"
                  >
                    <X :size="14" class="mr-1.5" />
                    不属实
                  </Button>
                </template>

                <p v-else class="text-muted text-xs">
                  这条已经是终态（{{
                    FISHING_SPOT_FEEDBACK_STATUS_LABELS[statusOf(selected)]
                  }}），不再改。
                </p>
              </div>
            </div>
          </template>

          <div
            v-else
            class="text-muted flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
          >
            <RefreshCw :size="20" />
            <p class="text-sm">这个筛选下没有反馈。</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
