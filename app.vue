<template>
  <div class="layout">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <!-- 顶部导航 -->
    <header class="header">
      <nav class="nav">
        <NuxtLink to="/" class="brand">
          <span class="brand-icon">🔍</span>
          <span class="brand-text">小宝网盘搜</span>
        </NuxtLink>

        <div class="site-links">
          <a href="https://xbkjz.cn/" target="_blank" rel="noopener"><span class="full">小宝</span>科技站</a>
          <a href="https://xbmlz.cn/" target="_blank" rel="noopener"><span class="full">小宝</span>命理站</a>
          <a href="https://xbyxz.cn/" target="_blank" rel="noopener"><span class="full">小宝</span>游戏站</a>
          <a href="https://paygame.xbkjz.icu/" target="_blank" rel="noopener"><span class="full">少年</span>作品墙</a>
        </div>

        <div class="nav-actions">
          <!-- 暗色模式切换 -->
          <ClientOnly>
            <button class="btn-icon" type="button" @click="toggleDark" :aria-label="isDark ? '切换到亮色模式' : '切换到暗色模式'" :title="isDark ? '亮色模式' : '暗色模式'">
              <svg v-if="!isDark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
          </ClientOnly>
          <!-- 设置按钮 -->
          <button class="btn-icon" type="button" @click="openSettings = true" aria-label="打开设置" title="设置">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </nav>
    </header>

    <!-- 公告条（全站导航栏下方；关闭后不再显示，改公告内容时升级 key 版本号重新展示） -->
    <div v-if="showAnnouncement" class="announce-bar" role="status">
      <span class="announce-bar__text">
        📢 为节省服务器资源，默认搜索 <strong>50 条</strong>结果即自动暂停；
        如需更多结果，点击「继续」即可继续搜索
      </span>
      <button class="announce-bar__close" type="button" @click="dismissAnnouncement" aria-label="关闭公告" title="关闭">✕</button>
    </div>

    <!-- 主内容区 -->
    <main class="main">
      <NuxtPage />
    </main>

    <!-- 设置抽屉 -->
    <ClientOnly>
      <SettingsDrawer
        v-model="settings"
        v-model:open="openSettings"
        :all-plugins="ALL_PLUGIN_NAMES"
        :all-tg-channels="allTgChannels"
        @save="saveSettings"
        @reset-default="resetToDefault" />
    </ClientOnly>

    <!-- Toast 通知 -->
    <div v-if="toast.show" class="toast" :class="toast.type" role="status" aria-live="polite">
      {{ toast.message }}
    </div>

    <!-- 密码门（仅在用户发起搜索时弹出） -->
    <ClientOnly>
      <PasswordGate
        :show="showPasswordGate"
        :error="auth.error.value || ''"
        :submitting="unlockSubmitting"
        @unlock="onUnlock" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { ALL_PLUGIN_NAMES } from "./config/plugins";
import channelsConfig from "~/config/channels.json";
// 暗色模式：阻塞脚本设置 class + CSS 文件引入
useHead({
  link: [{ rel: "stylesheet", href: "/css/dark-mode.css" }],
  script: [
    {
      innerHTML: `(function(){var s=localStorage.getItem('panhub:dark-mode');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')})();`,
    },
  ],
});

const { settings, loadSettings, saveSettings, resetToDefault } = useSettings();
const { toast, showToast } = useToast();
const { isDark, toggle: toggleDark, init: initDarkMode } = useDarkMode();
const auth = useAuth();
const openSettings = ref(false);
const showPasswordGate = ref(false);

const unlockSubmitting = ref(false);
const pendingOnUnlock = ref<(() => void) | null>(null);

function requestUnlock(onSuccess?: () => void) {
  pendingOnUnlock.value = onSuccess ?? null;
  showPasswordGate.value = true;
}

async function onUnlock(password: string) {
  unlockSubmitting.value = true;
  const ok = await auth.unlock(password);
  unlockSubmitting.value = false;
  if (ok) {
    showPasswordGate.value = false;
    const cb = pendingOnUnlock.value;
    pendingOnUnlock.value = null;
    if (cb) {
      nextTick(() => cb());
    }
  }
}

provide("requestUnlock", requestUnlock);

// 所有可用的 TG 频道（用于设置面板）
const allTgChannels = computed(() => {
  const configChannels = (useRuntimeConfig().public as any)?.tgDefaultChannels;
  return Array.isArray(configChannels) && configChannels.length > 0
    ? configChannels
    : channelsConfig.defaultChannels;
});

// 监听设置保存事件，显示提示
watch(() => settings.value, (newVal, oldVal) => {
  if (oldVal && newVal && JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
    showToast("设置已保存", "success");
  }
}, { deep: true });

onMounted(() => {
  initDarkMode();
  loadSettings();
  auth.fetchStatus();
  checkAnnouncement();
});

// 公告条（v1：搜索上限 50 自动暂停。改公告内容时升级 key 版本号，让已关闭用户重新看到）
const ANNOUNCEMENT_KEY = "panhub:announcement-dismissed:v1";
const showAnnouncement = ref(false);
function checkAnnouncement() {
  try {
    if (localStorage.getItem(ANNOUNCEMENT_KEY)) return;
  } catch {}
  showAnnouncement.value = true;
}
function dismissAnnouncement() {
  showAnnouncement.value = false;
  try {
    localStorage.setItem(ANNOUNCEMENT_KEY, "1");
  } catch {}
}
</script>

<style>
@import '~/assets/css/global.css';
</style>

<style scoped>
/* 主布局 */
.layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
}

/* 背景装饰 - 玻璃拟态效果 */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
  overflow: hidden;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.28;
  animation: blobFloat 8s ease-in-out infinite;
}

.blob-1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.blob-2 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #f59e0b, #fb7185);
  bottom: -50px;
  right: -50px;
  animation-delay: 2s;
}

.blob-3 {
  width: 250px;
  height: 250px;
  background: linear-gradient(135deg, #0ea5e9, #14b8a6);
  top: 50%;
  left: 70%;
  animation-delay: 4s;
}

/* 顶部导航 - 玻璃拟态 */
.header {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-glass);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: var(--shadow-sm);
}

.nav {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* 品牌标识 */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 20px;
  transition: transform var(--transition-fast);
}

.brand:hover {
  transform: scale(1.05);
}

.brand-icon {
  font-size: 24px;
  filter: drop-shadow(0 2px 4px rgba(15, 118, 110, 0.3));
}

.brand-text {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 自有站点导航 */
.site-links {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.site-links::-webkit-scrollbar { display: none; }
.site-links a {
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary, var(--text-primary));
  text-decoration: none;
  font-size: 14px;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.site-links a:hover {
  background: var(--bg-btn);
  color: var(--primary);
}
@media (max-width: 900px) {
  .site-links a { padding: 6px 8px; font-size: 13px; }
  .site-links .full { display: none; }
}
@media (max-width: 520px) {
  .nav { flex-wrap: wrap; row-gap: 8px; }
  .site-links { order: 3; flex-basis: 100%; justify-content: space-between; }
}

/* 导航操作区 */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 图标按钮 */
.btn-icon {
  width: 40px;
  height: 40px;
  border: none;
  background: var(--bg-btn);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: background-color var(--transition-fast), color var(--transition-fast),
    transform var(--transition-fast), box-shadow var(--transition-fast);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-glass);
}

.btn-icon:hover {
  background: var(--bg-btn-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.btn-icon:active {
  transform: translateY(0);
}

.btn-icon svg {
  stroke: currentColor;
}

/* 主内容区 */
.main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  animation: fadeIn 0.5s ease;
}

/* Toast 通知 */
.toast {
  position: fixed;
  top: 80px;
  right: 24px;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-light);
  font-weight: 500;
  z-index: 1000;
  animation: slideInRight 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.toast.info {
  color: var(--primary);
  border-left: 4px solid var(--primary);
}

.toast.success {
  color: var(--success);
  border-left: 4px solid var(--success);
}

.toast.error {
  color: var(--error);
  border-left: 4px solid var(--error);
}

/* 移动端优化 */
@media (max-width: 900px) {
  .nav {
    padding: 12px 16px;
  }

  .nav-actions {
    gap: 6px;
  }

  .btn-icon {
    width: 36px;
    height: 36px;
  }

  .main {
    padding: 16px;
  }

  .brand {
    font-size: 18px;
  }

  .toast {
    right: 16px;
    left: 16px;
    top: 70px;
  }

  .blob {
    filter: blur(40px);
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .btn-icon {
    border-width: 2px;
  }

  .brand-text {
    -webkit-text-fill-color: var(--text-primary);
    color: var(--text-primary);
  }
}

/* 减少动画模式支持 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .blob {
    animation: none;
  }
}

/* 公告条（全宽细条，导航栏下方） */
.announce-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 7px 16px;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border-bottom: 1px solid rgba(15, 118, 110, 0.12);
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
  line-height: 1.5;
  animation: barSlideIn 0.3s ease;
}
.announce-bar__text {
  text-align: center;
}
.announce-bar__text strong {
  color: var(--primary, #0f766e);
}
.announce-bar__close {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.announce-bar__close:hover {
  color: var(--text-secondary, #4b5563);
}
@keyframes barSlideIn {
  from {
    transform: translateY(-4px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
