<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import BrandMark from '../components/BrandMark.vue'
</script>

<template>
  <main class="not-found">
    <BrandMark />
    <div>
      <p>404 / LOST SIGNAL</p>
      <h1>这一页不在星图里。</h1>
      <span>链接可能已经失效，或者页面已经迁移。</span>
      <RouterLink to="/home">
        <ArrowLeft :size="17" />
        返回工作台
      </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.not-found {
  display: flex;
  min-height: 100svh;
  flex-direction: column;
  padding: clamp(24px, 5vw, 56px);
  background:
    linear-gradient(90deg, rgb(23 35 28 / 4%) 1px, transparent 1px),
    linear-gradient(rgb(23 35 28 / 4%) 1px, transparent 1px),
    var(--paper);
  background-size: 34px 34px;
}

.not-found > div {
  width: min(100%, 620px);
  margin: auto;
}

.not-found p {
  margin: 0 0 15px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.not-found h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(38px, 7vw, 72px);
  font-weight: 650;
  line-height: 1.08;
}

.not-found span {
  display: block;
  margin-top: 20px;
  color: var(--muted);
  font-size: 13px;
}

.not-found a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  margin-top: 30px;
  padding: 0 16px;
  border-radius: 7px;
  background: var(--forest);
  color: #fffaf1;
  font-size: 11px;
  font-weight: 750;
  text-decoration: none;
}
</style>
