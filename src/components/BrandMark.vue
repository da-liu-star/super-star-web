<script setup lang="ts">
import { Sparkles } from '@lucide/vue'

withDefaults(
  defineProps<{
    light?: boolean
    compact?: boolean
  }>(),
  {
    light: false,
    compact: false,
  },
)
</script>

<template>
  <div
    class="brand-mark"
    :class="{ 'brand-mark--light': light, 'brand-mark--compact': compact }"
    aria-label="Super Star"
  >
    <span class="brand-mark__symbol">
      <Sparkles :size="compact ? 16 : 19" :stroke-width="1.9" />
    </span>
    <span v-if="!compact" class="brand-mark__text">
      <strong>Super Star</strong>
      <small>Workspace</small>
    </span>
  </div>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: var(--ink);
}

.brand-mark__symbol {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  background: var(--accent);
  color: #fffaf1;
  box-shadow: 0 8px 20px rgb(207 82 49 / 24%);
}

.brand-mark__text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.brand-mark__text strong {
  font-size: 16px;
  font-weight: 760;
}

.brand-mark__text small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.brand-mark--light {
  color: #fffaf1;
}

.brand-mark--light .brand-mark__text small {
  color: rgb(255 250 241 / 56%);
}

.brand-mark--light .brand-mark__symbol {
  background: #fffaf1;
  color: var(--forest);
  box-shadow: none;
}

.brand-mark--compact .brand-mark__symbol {
  width: 32px;
  height: 32px;
}
</style>
