<script setup lang="ts">
/**
 * AdminFishingSpotsView —— 管理后台的钓点审核与纠错（工作台版）。
 *
 * 审核队列走独立端点（/v3/fish/spots/admin）而不是公开列表：公开列表在服务端
 * 把 status 写死成 approved，管理员想看待审的钓点只能另开一条路。
 *
 * 布局是**主从分栏**：左边是队列，右边是当前这条的完整档案。
 * 旧的卡片竖排版本审一条要上下滚动、弹窗关掉后还得找回看到第几条；
 * 分栏之后队列永远在视线里，审完一条自动落到下一条，位置不丢。
 *
 * 纠错就地做（不开弹窗）：弹窗会把队列挤出视野，而「改完这条接着看下一条」
 * 是审核台最常见的动作。字段本身交给 AdminSpotEditForm。
 *
 * 本页负责编排（取数、分页、审核动作、选中态），呈现细节交给子组件。
 */
import AdminSpotEditForm from '@/features/fishing/components/AdminSpotEditForm.vue';
import { fishingSpotsGateway } from '@readinglist/api';
import { mediaUrl } from '@/composables';
import { useNotificationStore } from '@/stores';
import { Button } from '@/components';
import { formatRelative } from '@/lib/dayjs';
import {
  FISHING_SPOT_CAR_LABELS,
  FISHING_SPOT_FEE_LABELS,
  FISHING_SPOT_KIND_ALL_LABELS,
  FISHING_SPOT_ROAD_LABELS,
  FISHING_SPOT_STATUS_LABELS,
} from '@readinglist/types';
import type { FishingSpot, FishingSpotStatus } from '@readinglist/types';
import {
  Check,
  ImageOff,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/** 状态筛选 —— '' 表示全部状态。 */
type StatusFilter = FishingSpotStatus | '';

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '未通过' },
];

const notifier = useNotificationStore();

const statusFilter = ref<StatusFilter>('pending');
const keyword = ref('');

const spots = ref<FishingSpot[]>([]);
const selectedId = ref<string | null>(null);
const page = ref(1);
const pageSize = 20;
const isLoading = ref(false);
const loadError = ref<string | null>(null);

/** 正在提交的审核动作 —— 按住它是为了让按钮进入 loading。 */
const acting = ref(false);

/** 详情区当前是「看」还是「改」。 */
const mode = ref<'view' | 'edit'>('view');

/** 驳回理由的就地输入区。 */
const isRejecting = ref(false);
const rejectNote = ref('');

/** 纠错表单的实例 —— 行动条上的保存按钮要问它能不能存。 */
const editForm = ref<InstanceType<typeof AdminSpotEditForm> | null>(null);

// ── 取数 ────────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    spots.value = await fishingSpotsGateway.listForReview({
      status: statusFilter.value || undefined,
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
  () => spots.value.find((spot) => spot.id === selectedId.value) ?? null,
);

/** 队列永远有落点：当前页换了内容后，选中项没了就落到第一条。 */
watch(
  spots,
  (list) => {
    if (!list.length) {
      selectedId.value = null;
      return;
    }
    if (!list.some((spot) => spot.id === selectedId.value)) {
      selectedId.value = list[0].id;
    }
  },
  { immediate: true },
);

function switchStatus(next: StatusFilter): void {
  if (statusFilter.value === next) return;
  statusFilter.value = next;
  page.value = 1;
  void load();
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
const hasNextPage = computed(() => spots.value.length >= pageSize);

function select(id: string): void {
  selectedId.value = id;
  mode.value = 'view';
  isRejecting.value = false;
}

function moveSelection(delta: number): void {
  const list = spots.value;
  if (!list.length) return;
  const index = list.findIndex((spot) => spot.id === selectedId.value);
  const next = Math.min(
    list.length - 1,
    Math.max(0, (index < 0 ? 0 : index) + delta),
  );
  selectedId.value = list[next].id;
}

// ── 审核动作 ────────────────────────────────────────────────────────────

/** 审核动作：放行不需要理由，驳回要。 */
async function approve(spot: FishingSpot): Promise<void> {
  if (acting.value) return;
  acting.value = true;
  try {
    await fishingSpotsGateway.review(spot.id, { approve: true });
    notifier.success(`已放行「${spot.name}」`);
    await load();
  } catch (error) {
    notifier.error(
      error instanceof Error ? error.message : '操作失败，请稍后重试',
    );
  } finally {
    acting.value = false;
  }
}

function openReject(spot: FishingSpot): void {
  selectedId.value = spot.id;
  isRejecting.value = !isRejecting.value;
  rejectNote.value = '';
}

async function confirmReject(): Promise<void> {
  const spot = selected.value;
  if (!spot || !rejectNote.value.trim() || acting.value) return;
  acting.value = true;
  try {
    await fishingSpotsGateway.review(spot.id, {
      approve: false,
      note: rejectNote.value.trim(),
    });
    notifier.success(`已驳回「${spot.name}」`);
    isRejecting.value = false;
    rejectNote.value = '';
    await load();
  } catch (error) {
    notifier.error(
      error instanceof Error ? error.message : '操作失败，请稍后重试',
    );
  } finally {
    acting.value = false;
  }
}

// ── 纠错 ────────────────────────────────────────────────────────────────

function startEdit(): void {
  isRejecting.value = false;
  mode.value = 'edit';
}

/** 编辑保存后就地更新这一行 —— 审核状态不变，只有内容变了。 */
function onSaved(updated: FishingSpot): void {
  const index = spots.value.findIndex((s) => s.id === updated.id);
  if (index >= 0) spots.value[index] = { ...spots.value[index], ...updated };
  mode.value = 'view';
}

const canSaveEdit = computed(() => editForm.value?.canSave ?? false);

function saveEdit(): void {
  void editForm.value?.save();
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
  if (mode.value !== 'view') return;
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

function statusOf(spot: FishingSpot): FishingSpotStatus {
  return spot.status ?? 'pending';
}

/**
 * 状态徽章的配色。
 *
 * 只用主题里已有的语义 token：待审核走 accent（唯一的有彩色，正等人看），
 * 已通过走中性灰（已经办完的事不该再抢眼睛），未通过走 rose。
 */
function statusToneClass(spot: FishingSpot): string {
  switch (statusOf(spot)) {
    case 'approved':
      return 'bg-secondary text-muted';
    case 'rejected':
      return 'bg-destructive/12 text-destructive';
    default:
      return 'bg-accent/12 text-accent';
  }
}

function statusDotClass(spot: FishingSpot): string {
  switch (statusOf(spot)) {
    case 'approved':
      return 'bg-muted/50';
    case 'rejected':
      return 'bg-destructive';
    default:
      return 'bg-accent';
  }
}

function kindLabel(spot: FishingSpot): string {
  return spot.kind
    ? (FISHING_SPOT_KIND_ALL_LABELS[spot.kind] ?? '未分类')
    : '未分类';
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
            钓点审核
          </h1>
          <p class="text-muted text-sm">
            左边是队列，右边是这一条的完整档案。审完一条自动落到下一条 ——
            位置不会丢。
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
              aria-label="审核状态"
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
                  placeholder="搜名称 / 描述"
                  class="bg-surface text-ink ring-border/60 w-full rounded-lg py-1.5 pr-3 pl-8 text-sm ring-1 focus:ring-2 focus:outline-none"
                />
              </label>
              <Button variant="outline" size="sm" type="submit">搜索</Button>
            </form>
          </div>

          <p v-if="loadError" class="text-destructive text-sm">
            {{ loadError }}
          </p>

          <p
            v-else-if="isLoading && !spots.length"
            class="text-muted flex items-center gap-2 text-sm"
          >
            <Loader2 :size="16" class="animate-spin" />
            加载中…
          </p>

          <ul class="space-y-1.5">
            <li v-for="spot in spots" :key="spot.id">
              <button
                type="button"
                class="ring-border/60 w-full rounded-xl px-3 py-2.5 text-left ring-1 transition-all duration-200"
                :class="
                  spot.id === selectedId
                    ? 'bg-card ring-accent/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                    : 'hover:bg-card/60'
                "
                @click="select(spot.id)"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="statusDotClass(spot)"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm font-medium"
                    :class="spot.id === selectedId ? 'text-ink' : 'text-ink/85'"
                  >
                    {{ spot.name }}
                  </span>
                  <span class="text-muted shrink-0 text-xs tabular-nums">
                    {{ formatRelative(spot.created_at) }}
                  </span>
                </span>
                <span
                  class="text-muted mt-1 flex items-center gap-2 pl-3.5 text-xs"
                >
                  <span>{{ spot.owner?.name ?? '匿名' }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ spot.images.length }} 图</span>
                </span>
              </button>
            </li>

            <li
              v-if="!spots.length && !isLoading && !loadError"
              class="ring-border/60 bg-card text-muted rounded-xl px-4 py-8 text-center text-sm ring-1"
            >
              这个筛选下没有钓点。
            </li>
          </ul>

          <!-- 分页 -->
          <div
            v-if="spots.length"
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
            上下移动 · 审核通过的钓点最多 5 分钟后出现在公开列表
          </p>
        </section>

        <!-- 详情：定高 + sticky —— 右栏是工作台，不随内容长高；
             内容在卡内滚，行动条永远钉在卡底，队列在左侧照常滚页面。 -->
        <section
          class="ring-border/60 bg-card sticky top-24 flex h-[calc(100vh_-_13rem)] min-h-[520px] flex-col rounded-2xl ring-1"
        >
          <template v-if="selected">
            <!-- 照片 -->
            <div
              v-if="mode === 'view'"
              class="flex gap-2 overflow-x-auto p-4 pb-0"
            >
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
                没有照片
              </div>
            </div>

            <div class="flex-1 space-y-5 overflow-y-auto p-5">
              <!-- 标题区 -->
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="statusToneClass(selected)"
                  >
                    {{ FISHING_SPOT_STATUS_LABELS[statusOf(selected)] }}
                  </span>
                  <span
                    class="bg-muted/60 text-muted rounded-full px-2 py-0.5 text-xs"
                  >
                    {{ kindLabel(selected) }}
                  </span>
                  <span class="text-muted ml-auto text-xs tabular-nums">
                    提交于 {{ formatRelative(selected.created_at) }}
                  </span>
                </div>

                <h2 class="font-serif text-xl font-semibold tracking-tight">
                  {{ selected.name }}
                </h2>
              </div>

              <!-- 查看态 -->
              <template v-if="mode === 'view'">
                <p class="text-ink/85 text-sm leading-relaxed">
                  {{ selected.description }}
                </p>

                <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">坐标（只读）</dt>
                    <dd class="flex items-center gap-1.5 text-sm tabular-nums">
                      <MapPin :size="13" class="text-muted" />
                      {{ selected.location[0].toFixed(4) }},
                      {{ selected.location[1].toFixed(4) }}
                    </dd>
                  </div>
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">文字地址</dt>
                    <dd class="text-sm">{{ selected.address ?? '—' }}</dd>
                  </div>
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">收费</dt>
                    <dd class="text-sm">
                      {{
                        selected.fee_type === 'paid'
                          ? `¥${selected.fee_amount ?? '?'} / 人`
                          : (FISHING_SPOT_FEE_LABELS[
                              selected.fee_type ?? 'unknown'
                            ] ?? '未知')
                      }}
                    </dd>
                  </div>
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">道路 / 车到水边</dt>
                    <dd class="text-sm">
                      {{
                        FISHING_SPOT_ROAD_LABELS[
                          selected.road_condition ?? 'unknown'
                        ] ?? '未知'
                      }}
                      ·
                      {{
                        FISHING_SPOT_CAR_LABELS[
                          selected.car_access ?? 'unknown'
                        ] ?? '未知'
                      }}
                    </dd>
                  </div>
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">开放时间</dt>
                    <dd class="text-sm">{{ selected.opening_hours ?? '—' }}</dd>
                  </div>
                  <div class="space-y-0.5">
                    <dt class="text-muted text-xs">标签</dt>
                    <dd class="flex flex-wrap gap-1">
                      <span
                        v-for="tag in selected.tags"
                        :key="tag"
                        class="bg-muted/60 text-muted rounded-full px-2 py-0.5 text-xs"
                      >
                        {{ tag }}
                      </span>
                    </dd>
                  </div>
                </dl>

                <div
                  class="bg-secondary/50 ring-border/60 flex items-center gap-3 rounded-xl p-3 ring-1"
                >
                  <img
                    v-if="selected.owner?.avatar"
                    :src="mediaUrl(selected.owner.avatar)"
                    alt=""
                    class="size-9 shrink-0 rounded-full object-cover"
                  />
                  <span
                    v-else
                    class="bg-accent/12 text-accent flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                  >
                    {{ selected.owner?.name?.charAt(0) ?? '?' }}
                  </span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">
                      {{ selected.owner?.name ?? '匿名投稿' }}
                    </p>
                    <p class="text-muted text-xs tabular-nums">
                      uid {{ selected.owner?.user_id ?? '—' }} · 浏览
                      {{ selected.view_count ?? 0 }}
                    </p>
                  </div>
                </div>

                <p
                  v-if="selected.review_note"
                  class="bg-destructive/10 text-destructive rounded-xl px-3 py-2 text-sm"
                >
                  驳回理由：{{ selected.review_note }}
                </p>
              </template>

              <!-- 编辑态：就地改，不开弹窗 -->
              <AdminSpotEditForm
                v-else
                ref="editForm"
                :key="selected.id"
                :spot="selected"
                @saved="onSaved"
              />
            </div>

            <!-- 行动条 -->
            <div class="border-border/40 border-t p-4">
              <!-- 驳回理由 -->
              <div
                v-if="isRejecting && mode === 'view'"
                class="bg-secondary/50 ring-border/60 mb-3 space-y-2 rounded-xl p-3 ring-1"
              >
                <p class="text-muted text-xs">
                  驳回理由会原样展示给作者 ——
                  作者只能看到这一条信息，说清楚该改什么。
                </p>
                <textarea
                  v-model="rejectNote"
                  rows="3"
                  placeholder="例如：位置标在了马路另一侧，请核实后重新标注"
                  class="bg-surface text-ink ring-border/60 w-full rounded-lg px-3 py-2 text-sm ring-1 focus:ring-2 focus:outline-none"
                />
                <div class="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="isRejecting = false"
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    :disabled="!rejectNote.trim() || acting"
                    @click="confirmReject"
                  >
                    <Loader2
                      v-if="acting"
                      :size="14"
                      class="mr-1.5 animate-spin"
                    />
                    确认驳回
                  </Button>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2">
                <template v-if="mode === 'view'">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="acting"
                    @click="openReject(selected)"
                  >
                    <X :size="14" class="mr-1.5" />
                    驳回
                  </Button>
                  <Button variant="outline" size="sm" @click="startEdit">
                    <Pencil :size="14" class="mr-1.5" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    :disabled="acting"
                    @click="approve(selected)"
                  >
                    <Loader2
                      v-if="acting"
                      :size="14"
                      class="mr-1.5 animate-spin"
                    />
                    <Check v-else :size="14" class="mr-1.5" />
                    通过
                  </Button>
                </template>
                <template v-else>
                  <Button variant="outline" size="sm" @click="mode = 'view'">
                    取消
                  </Button>
                  <Button size="sm" :disabled="!canSaveEdit" @click="saveEdit">
                    保存
                  </Button>
                </template>
              </div>
            </div>
          </template>

          <div
            v-else
            class="text-muted flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
          >
            <RefreshCw :size="20" />
            <p class="text-sm">这个筛选下没有钓点。</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
