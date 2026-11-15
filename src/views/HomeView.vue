<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ImagePlus, LogOut } from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const displayName = computed(() => auth.displayName || '用户')

async function logout(): Promise<void> {
  try {
    await auth.logout()
  } finally {
    await router.replace('/auth')
  }
}
</script>

<template>
  <div class="home-page">
    <header class="home-header">
      <BrandMark />
      <div class="account">
        <span>{{ displayName }}</span>
        <button
          type="button"
          class="logout-button"
          title="退出登录"
          aria-label="退出登录"
          @click="logout"
        >
          <LogOut :size="17" />
        </button>
      </div>
    </header>

    <main class="home-main">
      <h1>工作台</h1>

      <section class="tool-section" aria-labelledby="tool-heading">
        <h2 id="tool-heading">图片工具</h2>
        <button
          type="button"
          class="tool-row"
          @click="router.push('/editor')"
        >
          <span class="tool-icon">
            <ImagePlus :size="20" />
          </span>
          <span class="tool-copy">
            <strong>图片编辑</strong>
            <small>拼接、裁剪、旋转和导出</small>
          </span>
          <ArrowRight :size="18" />
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100svh;
  background: #f6f6f3;
  color: #233029;
  font-family: var(--font-sans);
}

.home-header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 clamp(18px, 4vw, 40px);
  border-bottom: 1px solid #deded8;
  background: #fff;
}

.account {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #69736d;
  font-size: 12px;
  font-weight: 600;
}

.logout-button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid #deded8;
  border-radius: 8px;
  background: #fff;
  color: #657169;
  cursor: pointer;
}

.logout-button:hover {
  border-color: #aab5ae;
  color: #25332b;
}

.home-main {
  width: min(100%, 980px);
  margin: 0 auto;
  padding: clamp(34px, 7vw, 72px) clamp(18px, 4vw, 40px);
}

.home-main h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 750;
}

.tool-section {
  margin-top: 42px;
}

.tool-section h2 {
  margin: 0 0 12px;
  color: #7a837d;
  font-size: 12px;
  font-weight: 650;
}

.tool-row {
  display: grid;
  width: 100%;
  min-height: 76px;
  grid-template-columns: 42px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 14px;
  padding: 12px 4px;
  border: 0;
  border-top: 1px solid #deded8;
  border-bottom: 1px solid #deded8;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.tool-row:hover {
  color: #496b59;
}

.tool-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #d7dad4;
  border-radius: 10px;
  background: #fff;
  color: #557564;
}

.tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.tool-copy strong {
  font-size: 14px;
  font-weight: 700;
}

.tool-copy small {
  color: #858d87;
  font-size: 11px;
}

.tool-row > svg {
  color: #8b938d;
}

@media (max-width: 520px) {
  .account > span {
    display: none;
  }

  .home-main {
    padding-top: 34px;
  }

  .tool-section {
    margin-top: 32px;
  }
}
</style>
