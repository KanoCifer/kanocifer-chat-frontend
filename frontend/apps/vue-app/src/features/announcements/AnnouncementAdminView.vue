<script setup lang="ts">
import { BasicDetail, Button, ConfirmDialog, FieldError } from '@/components';
import { announcementGateway } from '@readinglist/api';
import { formatDate } from '@/lib/dayjs';
import { useNotificationStore } from '@/stores';
import { useAuthStore } from '@/features/auth';
import { isAxiosError } from 'axios';
import { useHead } from '@vueuse/head';
import { Megaphone, Pencil, Plus, RefreshCw, Trash2, X } from '@lucide/vue';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TYPES,
  toKnownType,
  type Announcement,
  type AnnouncementPayload,
  type AnnouncementType,
} from '@readinglist/types';

// ── types ──────────────────────────────────────────────────────────────

interface AnnouncementForm {
  title: string;
  content: string;
  type: AnnouncementType;
}

type FieldErrors = Record<keyof AnnouncementForm, string | null>;

interface TypeMeta {
  label: string;
  chip: string;
}

// ── 分类展示映射（未知值已由 toKnownType 降级为 general）────────────

const TYPE_META: Record<AnnouncementType, TypeMeta> = {
  general: { label: '通用', chip: 'bg-secondary text-ink' },
  feature: { label: '新功能', chip: 'bg-accent/15 text-accent' },
  update: { label: '版本更新', chip: 'bg-secondary text-ink' },
  maintenance: { label: '维护停机', chip: 'bg-warning/15 text-warning' },
  security: { label: '安全', chip: 'bg-destructive/15 text-destructive' },
  credit: { label: '积分', chip: 'bg-success/15 text-success' },
};

// ── state ──────────────────────────────────────────────────────────────

const notifier = useNotificationStore();
const auth = useAuthStore();

const announcements = ref<Announcement[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const isDeleting = ref(false);
const editingId = ref<number | null>(null);
const deleteTarget = ref<Announcement | null>(null);

const form = reactive<AnnouncementForm>({
  title: '',
  content: '',
  type: 'general',
});
const fieldErrors = reactive<FieldErrors>({
  title: null,
  content: null,
  type: null,
});

const isEditing = computed(() => editingId.value !== null);
const canSubmit = computed(() => !isSubmitting.value && auth.isAdmin);

// ── validators ─────────────────────────────────────────────────────────

function validate(): boolean {
  fieldErrors.title = null;
  fieldErrors.content = null;
  fieldErrors.type = null;

  let ok = true;
  const title = form.title.trim();
  if (!title) {
    fieldErrors.title = '请输入标题';
    ok = false;
  } else if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    fieldErrors.title = `标题不超过 ${ANNOUNCEMENT_TITLE_MAX} 个字符`;
    ok = false;
  }
  if (!form.content.trim()) {
    fieldErrors.content = '请输入公告正文';
    ok = false;
  }
  return ok;
}

// ── error mapping ──────────────────────────────────────────────────────

/** 业务错误 { message } 与鉴权错误 { error } 已在 apiClient 拦截器归一到 err.message。 */
function readError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function applyServerError(err: unknown, fallback: string): void {
  if (!isAxiosError(err)) {
    notifier.error(readError(err, fallback));
    return;
  }
  if (err.response?.status === 403) {
    notifier.error('需要管理员权限');
    return;
  }
  if (err.response?.status === 400) {
    // 校验错误尽量定位到字段，定位不到（invalid request body）才退回 toast
    const msg = readError(err, fallback);
    if (/type/i.test(msg)) fieldErrors.type = msg;
    else if (/title/i.test(msg)) fieldErrors.title = msg;
    else if (/content/i.test(msg)) fieldErrors.content = msg;
    else notifier.error(msg);
    return;
  }
  notifier.error(readError(err, fallback));
}

// ── data ───────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  isLoading.value = true;
  try {
    announcements.value = await announcementGateway.list();
  } catch (err) {
    announcements.value = [];
    notifier.error(readError(err, '加载公告失败'));
  } finally {
    isLoading.value = false;
  }
}

function resetForm(): void {
  editingId.value = null;
  form.title = '';
  form.content = '';
  form.type = 'general';
  fieldErrors.title = null;
  fieldErrors.content = null;
  fieldErrors.type = null;
}

function startEdit(a: Announcement): void {
  editingId.value = a.id;
  form.title = a.title;
  form.content = a.content;
  form.type = toKnownType(a.type);
  fieldErrors.title = null;
  fieldErrors.content = null;
  fieldErrors.type = null;
}

// ── actions ────────────────────────────────────────────────────────────

async function submit(): Promise<void> {
  if (!canSubmit.value || !validate()) return;

  // PUT 是全量覆盖：title / content / type 一起发，漏一个服务端会写空并 400
  const payload: AnnouncementPayload = {
    title: form.title.trim(),
    content: form.content.trim(),
    type: form.type,
  };

  isSubmitting.value = true;
  try {
    if (editingId.value === null) {
      await announcementGateway.create(payload);
      notifier.success('公告已发布');
    } else {
      await announcementGateway.update(editingId.value, payload);
      notifier.success('公告已更新');
    }
    resetForm();
    await load();
  } catch (err) {
    applyServerError(err, isEditing.value ? '更新失败' : '发布失败');
  } finally {
    isSubmitting.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target || isDeleting.value) return;

  isDeleting.value = true;
  try {
    await announcementGateway.remove(target.id);
    deleteTarget.value = null;
    notifier.success('公告已删除');
    await load();
  } catch (err) {
    applyServerError(err, '删除失败');
  } finally {
    isDeleting.value = false;
  }
}

// ── display helpers ────────────────────────────────────────────────────

function typeMeta(type: string): TypeMeta {
  return TYPE_META[toKnownType(type)];
}

useHead({
  title: "公告管理 - Kuroome's Blog",
  meta: [
    { name: 'description', content: '发布、编辑与删除站点公告' },
    { property: 'og:title', content: '公告管理' },
  ],
});

// ── lifecycle ──────────────────────────────────────────────────────────

onMounted(() => {
  if (!auth.isAdmin) {
    notifier.error('需要管理员权限');
    return;
  }
  void load();
});
</script>

<template>
  <BasicDetail
    title="Admin · Announcements"
    subtitle="站点公告的发布 / 编辑 / 删除，写接口需管理员白名单"
  >
    <div class="col-span-full mx-auto w-full max-w-6xl space-y-8">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <!-- 左：发布 / 编辑表单 -->
        <section
          class="bg-card text-ink ring-border/60 h-fit space-y-4 rounded-2xl p-5 ring-1"
        >
          <header class="flex items-center gap-2">
            <Megaphone :size="18" class="text-accent" />
            <h2 class="font-family-averia text-lg">
              {{ isEditing ? '编辑公告' : '发布公告' }}
            </h2>
          </header>

          <div class="space-y-1">
            <label for="ann-title" class="text-muted text-xs">标题</label>
            <input
              id="ann-title"
              v-model="form.title"
              type="text"
              :maxlength="ANNOUNCEMENT_TITLE_MAX"
              :aria-invalid="!!fieldErrors.title"
              :aria-describedby="
                fieldErrors.title ? 'ann-title-error' : undefined
              "
              class="bg-page ring-border/60 text-ink focus:ring-ring w-full rounded-xl px-3 py-2 text-sm ring-1 outline-none focus:ring-2"
              placeholder="一句话说清这条公告"
            />
            <div class="flex items-start justify-between gap-2">
              <FieldError
                id="ann-title"
                :message="fieldErrors.title"
                size="xs"
              />
              <span class="text-muted mt-1 shrink-0 text-xs tabular-nums">
                {{ form.title.length }} / {{ ANNOUNCEMENT_TITLE_MAX }}
              </span>
            </div>
          </div>

          <div class="space-y-1">
            <label for="ann-type" class="text-muted text-xs">分类</label>
            <select
              id="ann-type"
              v-model="form.type"
              class="bg-page ring-border/60 text-ink focus:ring-ring w-full rounded-xl px-3 py-2 text-sm ring-1 outline-none focus:ring-2"
            >
              <option v-for="t in ANNOUNCEMENT_TYPES" :key="t" :value="t">
                {{ typeMeta(t).label }}
              </option>
            </select>
            <FieldError id="ann-type" :message="fieldErrors.type" size="xs" />
          </div>

          <div class="space-y-1">
            <label for="ann-content" class="text-muted text-xs">正文</label>
            <textarea
              id="ann-content"
              v-model="form.content"
              rows="7"
              :aria-invalid="!!fieldErrors.content"
              :aria-describedby="
                fieldErrors.content ? 'ann-content-error' : undefined
              "
              class="bg-page ring-border/60 text-ink focus:ring-ring w-full resize-y rounded-xl px-3 py-2 text-sm leading-relaxed ring-1 outline-none focus:ring-2"
              placeholder="公告正文，换行会原样保留"
            ></textarea>
            <FieldError
              id="ann-content"
              :message="fieldErrors.content"
              size="xs"
            />
          </div>

          <div class="flex items-center gap-2 pt-1">
            <Button :disabled="!canSubmit" @click="submit">
              <component
                :is="isEditing ? Pencil : Plus"
                :size="16"
                class="mr-1.5"
              />
              {{ isEditing ? '保存修改' : '发布' }}
            </Button>
            <Button
              v-if="isEditing"
              variant="outline"
              size="sm"
              :disabled="isSubmitting"
              @click="resetForm"
            >
              <X :size="14" class="mr-1.5" />
              取消
            </Button>
          </div>
        </section>

        <!-- 右：公告列表 -->
        <section
          class="bg-card text-ink ring-border/60 space-y-4 rounded-2xl p-5 ring-1"
        >
          <header class="flex items-center justify-between gap-3">
            <h2 class="font-family-averia text-lg">
              全部公告
              <span class="text-muted ml-1 text-sm font-normal">
                {{ announcements.length }}
              </span>
            </h2>
            <Button
              variant="outline"
              size="sm"
              :disabled="isLoading"
              @click="load"
            >
              <RefreshCw :size="16" class="mr-1.5" />
              刷新
            </Button>
          </header>

          <p
            v-if="isLoading"
            class="text-muted py-6 text-center text-sm"
            aria-live="polite"
          >
            加载中…
          </p>
          <p
            v-else-if="announcements.length === 0"
            class="text-muted py-6 text-center text-sm"
          >
            还没有公告，先在左侧发布一条。
          </p>

          <ul v-else class="space-y-3">
            <li
              v-for="a in announcements"
              :key="a.id"
              class="border-border/40 space-y-2 rounded-xl border p-4"
              :class="a.id === editingId ? 'bg-surface' : ''"
            >
              <div class="flex items-start gap-2">
                <span
                  class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="typeMeta(a.type).chip"
                >
                  {{ typeMeta(a.type).label }}
                </span>
                <h3 class="text-ink min-w-0 flex-1 text-sm font-medium">
                  {{ a.title }}
                </h3>
                <span class="text-muted shrink-0 text-xs tabular-nums">
                  #{{ a.id }}
                </span>
              </div>

              <p class="text-muted text-sm leading-relaxed whitespace-pre-wrap">
                {{ a.content }}
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <span class="text-muted text-xs">
                  创建于 {{ formatDate(a.created_at) }}
                </span>
                <span
                  v-if="a.updated_at && a.updated_at !== a.created_at"
                  class="text-muted text-xs"
                >
                  · 更新于 {{ formatDate(a.updated_at) }}
                </span>
                <span class="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    :aria-label="`编辑公告：${a.title}`"
                    @click="startEdit(a)"
                  >
                    <Pencil :size="14" class="mr-1" />
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    :aria-label="`删除公告：${a.title}`"
                    @click="deleteTarget = a"
                  >
                    <Trash2 :size="14" class="mr-1" />
                    删除
                  </Button>
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </BasicDetail>

  <!-- 弹层必须与 BasicDetail 平级：其内容层带 scaleX transform，会成为
       fixed 定位的包含块，把弹层锁在卡片里 -->
  <ConfirmDialog
    :open="!!deleteTarget"
    title="删除公告？"
    :message="deleteTarget ? `「${deleteTarget.title}」删除后无法恢复。` : ''"
    confirm-text="删除"
    cancel-text="取消"
    variant="destructive"
    @close="deleteTarget = null"
    @confirm="confirmDelete"
  />
</template>
