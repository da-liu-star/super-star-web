<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  UserPlus,
  UserRound,
} from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import { useAuthStore } from '../stores/auth'
import {
  validateLogin,
  validateRegistration,
} from '../utils/validation'

type AuthMode = 'login' | 'register'

interface AuthForm {
  username: string
  nickname: string
  email: string
  password: string
  confirmPassword: string
  accepted: boolean
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mode = ref<AuthMode>('login')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const serverError = ref(auth.restoreError)
const fieldErrors = reactive<Record<string, string>>({})
const sceneRef = ref<HTMLElement | null>(null)
const usernameFocused = ref(false)
const passwordFocused = ref(false)
const isLoginError = ref(false)

let errorTimer: ReturnType<typeof setTimeout> | undefined
let pointerFrame = 0

const form = reactive<AuthForm>({
  username: '',
  nickname: '',
  email: '',
  password: '',
  confirmPassword: '',
  accepted: false,
})

const isRegister = computed(() => mode.value === 'register')
const passwordVisible = computed(
  () => showPassword.value || showConfirmPassword.value,
)
const submitLabel = computed(() =>
  isRegister.value ? '创建账号并进入' : '进入工作台',
)
const sceneClasses = computed(() => ({
  'characters--typing': usernameFocused.value,
  'characters--password': passwordFocused.value
    && !passwordVisible.value
    && !isLoginError.value,
  'characters--peek': passwordVisible.value && !isLoginError.value,
  'characters--error': isLoginError.value,
}))

onMounted(() => {
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  if (pointerFrame) {
    cancelAnimationFrame(pointerFrame)
  }
  if (errorTimer) {
    clearTimeout(errorTimer)
  }
})

function handlePointerMove(event: PointerEvent): void {
  if (pointerFrame) {
    return
  }
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0
    const scene = sceneRef.value
    if (!scene) {
      return
    }
    const rect = scene.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height * 0.36)
    const eyeX = clamp(dx / 28, -8, 8)
    const eyeY = clamp(dy / 35, -6, 6)

    scene.style.setProperty('--eye-x', `${eyeX}px`)
    scene.style.setProperty('--eye-y', `${eyeY}px`)
    scene.style.setProperty('--purple-tilt', `${clamp(-dx / 120, -6, 6)}deg`)
    scene.style.setProperty('--black-tilt', `${clamp(dx / 180, -4, 4)}deg`)
    scene.style.setProperty('--orange-tilt', `${clamp(-dx / 150, -5, 5)}deg`)
    scene.style.setProperty('--yellow-tilt', `${clamp(dx / 160, -5, 5)}deg`)
  })
}

function handleUsernameFocus(): void {
  usernameFocused.value = true
}

function handleUsernameBlur(): void {
  usernameFocused.value = false
}

function handlePasswordFocus(): void {
  passwordFocused.value = true
}

function handlePasswordBlur(): void {
  passwordFocused.value = false
}

function triggerCharacterError(): void {
  isLoginError.value = true
  if (errorTimer) {
    clearTimeout(errorTimer)
  }
  errorTimer = setTimeout(() => {
    isLoginError.value = false
    errorTimer = undefined
  }, 2600)
}

function switchMode(nextMode: AuthMode): void {
  if (mode.value === nextMode || auth.pending) {
    return
  }
  mode.value = nextMode
  serverError.value = ''
  form.password = ''
  form.confirmPassword = ''
  form.accepted = false
  usernameFocused.value = false
  passwordFocused.value = false
  isLoginError.value = false
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = undefined
  }
  clearErrors()
}

async function submit(): Promise<void> {
  if (auth.pending) {
    return
  }

  clearErrors()
  serverError.value = ''

  if (isRegister.value) {
    const errors = validateRegistration(form)
    if (!form.accepted) {
      errors.confirmPassword = errors.confirmPassword || '请先同意服务条款'
    }
    Object.assign(fieldErrors, errors)
    if (Object.keys(errors).length > 0) {
      triggerCharacterError()
      return
    }
    await submitRegistration()
    return
  }

  const errors = validateLogin(form)
  Object.assign(fieldErrors, errors)
  if (Object.keys(errors).length > 0) {
    triggerCharacterError()
    return
  }
  await submitLogin()
}

async function submitLogin(): Promise<void> {
  try {
    await auth.login({
      username: form.username.trim(),
      password: form.password,
    })
    await router.replace(resolveRedirect())
  } catch (error) {
    serverError.value = friendlyError(error)
    triggerCharacterError()
  }
}

async function submitRegistration(): Promise<void> {
  try {
    await auth.register({
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim(),
      email: form.email.trim(),
    })
    await router.replace(resolveRedirect())
  } catch (error) {
    serverError.value = friendlyError(error)
    triggerCharacterError()
  }
}

function resolveRedirect(): string {
  const target = route.query.redirect
  if (
    typeof target === 'string'
    && target.startsWith('/')
    && !target.startsWith('//')
  ) {
    return target
  }
  return '/home'
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '请求失败，请稍后重试'
  const normalized = message.toLowerCase()

  if (normalized.includes('username is already') || message.includes('已被注册')) {
    return '该用户名已被注册，请更换后重试'
  }
  if (normalized.includes('username or password')) {
    return '用户名或密码不正确'
  }
  if (normalized.includes('registration data')) {
    return '注册信息校验失败，请检查后重试'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('无法连接')) {
    return '无法连接认证服务，请确认后端已启动'
  }
  return message || '请求失败，请稍后重试'
}

function clearErrors(): void {
  Object.keys(fieldErrors).forEach((key) => {
    delete fieldErrors[key]
  })
}

function clearFieldError(field: string): void {
  delete fieldErrors[field]
  serverError.value = ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
</script>

<template>
  <main class="auth-page">
    <section class="visual-panel" aria-label="Super Star">
      <header class="visual-header">
        <BrandMark />
      </header>

      <div class="characters-wrapper" aria-hidden="true">
        <div
          ref="sceneRef"
          class="characters"
          :class="sceneClasses"
        >
          <div class="character character--purple">
            <div class="eyes eyes--purple eyes--white">
              <span class="eye"><span class="pupil"></span></span>
              <span class="eye"><span class="pupil"></span></span>
            </div>
          </div>

          <div class="character character--black">
            <div class="eyes eyes--black eyes--white">
              <span class="eye"><span class="pupil"></span></span>
              <span class="eye"><span class="pupil"></span></span>
            </div>
          </div>

          <div class="character character--orange">
            <div class="eyes eyes--orange eyes--bare">
              <span class="bare-pupil"></span>
              <span class="bare-pupil"></span>
            </div>
            <span class="sad-mouth"></span>
          </div>

          <div class="character character--yellow">
            <div class="eyes eyes--yellow eyes--bare">
              <span class="bare-pupil"></span>
              <span class="bare-pupil"></span>
            </div>
            <span class="straight-mouth"></span>
          </div>
        </div>
      </div>

    </section>

    <section class="form-side">
      <div class="form-container">
        <div class="auth-tabs" role="tablist" aria-label="登录方式">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'login'"
            :class="{ active: mode === 'login' }"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'register'"
            :class="{ active: mode === 'register' }"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <form class="auth-form" novalidate @submit.prevent="submit">
          <template v-if="isRegister">
            <div class="field-group">
              <label for="nickname">昵称</label>
              <div class="input-shell" :class="{ invalid: fieldErrors.nickname }">
                <UserRound :size="18" />
                <input
                  id="nickname"
                  v-model="form.nickname"
                  type="text"
                  autocomplete="nickname"
                  placeholder="怎么称呼你"
                  @input="clearFieldError('nickname')"
                />
              </div>
              <p v-if="fieldErrors.nickname" class="field-error">
                {{ fieldErrors.nickname }}
              </p>
            </div>

            <div class="field-group">
              <label for="email">邮箱 <span>选填</span></label>
              <div class="input-shell" :class="{ invalid: fieldErrors.email }">
                <Mail :size="18" />
                <input
                  id="email"
                  v-model="form.email"
                  type="email"
                  autocomplete="email"
                  placeholder="name@example.com"
                  @focus="handleUsernameFocus"
                  @blur="handleUsernameBlur"
                  @input="clearFieldError('email')"
                />
              </div>
              <p v-if="fieldErrors.email" class="field-error">
                {{ fieldErrors.email }}
              </p>
            </div>
          </template>

          <div class="field-group">
            <label for="username">用户名</label>
            <div class="input-shell" :class="{ invalid: fieldErrors.username }">
              <UserRound :size="18" />
              <input
                id="username"
                v-model="form.username"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                placeholder="3-20 位字母、数字或下划线"
                @focus="handleUsernameFocus"
                @blur="handleUsernameBlur"
                @input="clearFieldError('username')"
              />
            </div>
            <p v-if="fieldErrors.username" class="field-error">
              {{ fieldErrors.username }}
            </p>
          </div>

          <div class="field-group">
            <label for="password">密码</label>
            <div class="input-shell" :class="{ invalid: fieldErrors.password }">
              <LockKeyhole :size="18" />
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="isRegister ? 'new-password' : 'current-password'"
                placeholder="至少 6 个字符"
                @focus="handlePasswordFocus"
                @blur="handlePasswordBlur"
                @input="clearFieldError('password')"
              />
              <button
                type="button"
                class="password-toggle"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="18" />
                <Eye v-else :size="18" />
              </button>
            </div>
            <p v-if="fieldErrors.password" class="field-error">
              {{ fieldErrors.password }}
            </p>
          </div>

          <div v-if="isRegister" class="field-group">
            <label for="confirm-password">确认密码</label>
            <div
              class="input-shell"
              :class="{ invalid: fieldErrors.confirmPassword }"
            >
              <LockKeyhole :size="18" />
              <input
                id="confirm-password"
                v-model="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入密码"
                @focus="handlePasswordFocus"
                @blur="handlePasswordBlur"
                @input="clearFieldError('confirmPassword')"
              />
              <button
                type="button"
                class="password-toggle"
                :title="showConfirmPassword ? '隐藏密码' : '显示密码'"
                :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <EyeOff v-if="showConfirmPassword" :size="18" />
                <Eye v-else :size="18" />
              </button>
            </div>
            <p v-if="fieldErrors.confirmPassword" class="field-error">
              {{ fieldErrors.confirmPassword }}
            </p>
          </div>

          <label v-if="isRegister" class="agreement-row">
            <input
              v-model="form.accepted"
              type="checkbox"
              @change="clearFieldError('confirmPassword')"
            />
            <span class="custom-checkbox">
              <Check :size="13" :stroke-width="3" />
            </span>
            <span>我已阅读并同意服务条款与隐私政策</span>
          </label>

          <div v-if="serverError" class="form-alert" role="alert">
            <CircleAlert :size="17" />
            <span>{{ serverError }}</span>
          </div>

          <button
            type="submit"
            class="submit-button"
            :class="{ 'submit-button--register': isRegister }"
            :disabled="auth.pending"
            :aria-label="submitLabel"
          >
            <LoaderCircle v-if="auth.pending" class="spinner" :size="20" />
            <template v-else>
              <span class="submit-label">
                <UserPlus v-if="isRegister" :size="19" />
                <LogIn v-else :size="19" />
                {{ submitLabel }}
              </span>
              <span class="submit-hover" aria-hidden="true">
                {{ submitLabel }}
                <ArrowRight :size="18" />
              </span>
            </template>
          </button>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  --auth-ink: #4f5e55;
  --auth-muted: #8a928b;
  --auth-focus: #9dcdb5;
  --auth-peach: #f1b28d;
  --auth-peach-dark: #6f4837;
  --accent: #eeb08d;
  --ink: #536259;
  display: grid;
  min-height: 100svh;
  grid-template-columns: minmax(430px, 1fr) minmax(520px, 1fr);
  overflow-x: hidden;
  background: #fdfbf7;
  color: var(--auth-ink);
  font-family: var(--font-rounded);
}

.visual-panel {
  position: relative;
  display: flex;
  min-height: 100svh;
  flex-direction: column;
  overflow: hidden;
  padding: clamp(30px, 4vw, 52px);
  background:
    linear-gradient(132deg, #f3ecef 0%, #e4efe8 48%, #dbe9e8 100%);
}

.visual-panel::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgb(255 255 255 / 42%), transparent 44%),
    linear-gradient(305deg, rgb(213 235 226 / 31%), transparent 52%);
  content: '';
  pointer-events: none;
}

.visual-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
}

.characters-wrapper {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
}

.characters {
  --eye-x: 0px;
  --eye-y: 0px;
  --purple-tilt: 0deg;
  --black-tilt: 0deg;
  --orange-tilt: 0deg;
  --yellow-tilt: 0deg;
  position: relative;
  width: 520px;
  height: 430px;
  transform: scale(0.92);
  transform-origin: center bottom;
}

.character {
  position: absolute;
  bottom: 0;
  transition:
    transform 700ms cubic-bezier(0.2, 0.75, 0.25, 1),
    height 700ms cubic-bezier(0.2, 0.75, 0.25, 1);
  transform-origin: bottom center;
}

.character--purple {
  left: 78px;
  width: 170px;
  height: 360px;
  border-radius: 12px 12px 0 0;
  background: #a99cdf;
  transform: skewX(var(--purple-tilt));
  z-index: 1;
}

.character--black {
  left: 232px;
  width: 116px;
  height: 292px;
  border-radius: 10px 10px 0 0;
  background: #4d5c55;
  transform: skewX(var(--black-tilt));
  z-index: 2;
}

.character--orange {
  left: 18px;
  width: 230px;
  height: 194px;
  border-radius: 118px 118px 0 0;
  background: #f1b18d;
  transform: skewX(var(--orange-tilt));
  z-index: 3;
}

.character--yellow {
  left: 300px;
  width: 136px;
  height: 220px;
  border-radius: 70px 70px 0 0;
  background: #eedb8f;
  transform: skewX(var(--yellow-tilt));
  z-index: 4;
}

.eyes {
  position: absolute;
  display: flex;
  transition:
    left 700ms cubic-bezier(0.2, 0.75, 0.25, 1),
    top 700ms cubic-bezier(0.2, 0.75, 0.25, 1),
    transform 700ms cubic-bezier(0.2, 0.75, 0.25, 1);
  transform: translate(var(--eye-x), var(--eye-y));
}

.eyes--purple {
  top: 46px;
  left: 45px;
  gap: 29px;
}

.eyes--black {
  top: 36px;
  left: 27px;
  gap: 20px;
}

.eyes--orange {
  top: 92px;
  left: 82px;
  gap: 29px;
}

.eyes--yellow {
  top: 42px;
  left: 51px;
  gap: 21px;
}

.eye {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: #fffdf8;
  animation: blink 5.8s infinite;
  transform-origin: center;
}

.eyes--black .eye {
  width: 16px;
  height: 16px;
  animation-delay: 1.2s;
}

.pupil {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #405149;
}

.eyes--black .pupil {
  width: 6px;
  height: 6px;
}

.eyes--bare {
  gap: 20px;
}

.bare-pupil {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #46564e;
  transition: transform 700ms cubic-bezier(0.2, 0.75, 0.25, 1);
  transform: translate(var(--eye-x), var(--eye-y));
}

.straight-mouth {
  position: absolute;
  top: 91px;
  left: 42px;
  width: 48px;
  height: 4px;
  border-radius: 999px;
  background: #46564e;
  transition:
    transform 700ms cubic-bezier(0.2, 0.75, 0.25, 1),
    top 700ms cubic-bezier(0.2, 0.75, 0.25, 1),
    left 700ms cubic-bezier(0.2, 0.75, 0.25, 1);
}

.sad-mouth {
  position: absolute;
  top: 127px;
  left: 93px;
  width: 30px;
  height: 15px;
  border: 3px solid #46564e;
  border-top: 0;
  border-radius: 0 0 16px 16px;
  opacity: 0;
  transition:
    opacity 240ms ease,
    transform 700ms cubic-bezier(0.2, 0.75, 0.25, 1);
}

.characters--typing .character--purple {
  height: 392px;
  transform: translateX(28px) skewX(-11deg);
}

.characters--typing .character--black {
  transform: translateX(17px) skewX(9deg);
}

.characters--typing .character--orange {
  transform: translateX(8px);
}

.characters--typing .eyes--purple {
  top: 64px;
  left: 57px;
  transform: translate(4px, 2px);
}

.characters--typing .eyes--black {
  top: 15px;
  left: 33px;
  transform: translate(0, -2px);
}

.characters--typing .eyes--orange {
  top: 88px;
  left: 91px;
}

.characters--typing .eyes--yellow {
  top: 39px;
  left: 56px;
}

.characters--password .character--purple {
  height: 400px;
  transform: translateX(-18px) skewX(-14deg);
}

.characters--password .character--black {
  transform: translateX(-10px) skewX(12deg);
}

.characters--password .character--orange {
  transform: translateX(-6px) skewX(-4deg);
}

.characters--password .character--yellow {
  transform: translateX(-5px) skewX(-4deg);
}

.characters--password .eyes--purple {
  top: 26px;
  left: 18px;
  transform: none;
}

.characters--password .eyes--black {
  top: 20px;
  left: 8px;
  transform: none;
}

.characters--password .eyes--orange {
  top: 74px;
  left: 48px;
  transform: none;
}

.characters--password .eyes--yellow {
  top: 29px;
  left: 18px;
  transform: none;
}

.characters--password .bare-pupil {
  transform: translate(-5px, -4px);
}

.characters--password .pupil {
  transform: translate(-4px, -4px);
}

.characters--password .straight-mouth {
  top: 79px;
  left: 16px;
}

.characters--peek .character--purple {
  transform: skewX(-2deg);
}

.characters--peek .character--black {
  transform: skewX(3deg);
}

.characters--peek .bare-pupil {
  transform: translate(-3px, -3px);
}

.characters--peek .eyes--purple {
  transform: translate(4px, 2px);
}

.characters--error .character--purple {
  height: 360px;
  transform: translateX(-6px) skewX(-2deg);
}

.characters--error .character--black {
  transform: translateX(-4px) skewX(2deg);
}

.characters--error .eyes--purple {
  top: 55px;
  left: 31px;
  transform: none;
}

.characters--error .eyes--black {
  top: 39px;
  left: 15px;
  transform: none;
}

.characters--error .eyes--orange {
  top: 95px;
  left: 61px;
  transform: none;
}

.characters--error .eyes--yellow {
  top: 45px;
  left: 36px;
  transform: none;
}

.characters--error .bare-pupil,
.characters--error .pupil {
  transform: translate(-3px, 4px);
}

.characters--error .sad-mouth {
  opacity: 1;
}

.characters--error .straight-mouth {
  top: 93px;
  left: 31px;
  transform: rotate(-8deg);
}

.characters--error .eyes,
.characters--error .sad-mouth,
.characters--error .straight-mouth {
  animation: shake-head 760ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.form-side {
  display: grid;
  min-height: 100svh;
  place-items: center;
  overflow-y: auto;
  padding: clamp(24px, 5vw, 60px);
  background:
    linear-gradient(150deg, #fdfbf7 0%, #fffdf9 55%, #f6faf7 100%);
}

.form-container {
  width: min(100%, 420px);
}

.auth-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  margin-bottom: 34px;
}

.auth-tabs button {
  position: relative;
  padding: 4px 1px 9px;
  border: 0;
  background: transparent;
  color: #9a9e98;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
  transition: color 180ms ease;
}

.auth-tabs button::after {
  position: absolute;
  right: 50%;
  bottom: 0;
  left: 50%;
  height: 2px;
  border-radius: 999px;
  background: #9dcdb5;
  content: '';
  transition:
    right 180ms ease,
    left 180ms ease;
}

.auth-tabs button.active {
  color: #526159;
}

.auth-tabs button.active::after {
  right: 0;
  left: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  min-width: 0;
}

.field-group > label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 8px 5px;
  color: #657169;
  font-size: 12px;
  font-weight: 750;
}

.field-group > label span {
  color: #a0a69f;
  font-size: 10px;
  font-weight: 600;
}

.input-shell {
  display: flex;
  min-height: 55px;
  align-items: center;
  gap: 11px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: #f3f1eb;
  color: #9ca19a;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.input-shell:focus-within {
  border-color: var(--auth-focus);
  background: #f9f8f3;
  box-shadow:
    0 0 0 4px rgb(157 205 181 / 18%),
    0 8px 20px rgb(157 187 168 / 10%);
}

.input-shell.invalid {
  border-color: #e8ae8b;
  box-shadow: 0 0 0 4px rgb(232 174 139 / 16%);
}

.input-shell input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #4f5d55;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
}

.input-shell input::placeholder {
  color: #adb0aa;
  font-weight: 500;
}

.password-toggle {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #9ba19a;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.password-toggle:hover {
  background: rgb(255 255 255 / 72%);
  color: #62716a;
}

.field-error {
  margin: 7px 0 0 5px;
  color: #bd7355;
  font-size: 11px;
  font-weight: 600;
}

.agreement-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 1px 4px 0;
  color: #8b918b;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.6;
  cursor: pointer;
}

.agreement-row input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.custom-checkbox {
  display: grid;
  flex: 0 0 auto;
  width: 19px;
  height: 19px;
  margin-top: 1px;
  place-items: center;
  border: 1px solid #d5d4cd;
  border-radius: 7px;
  background: rgb(255 255 255 / 72%);
  color: transparent;
  transition:
    background 160ms ease,
    border-color 160ms ease;
}

.agreement-row input:checked + .custom-checkbox {
  border-color: #9dcdb5;
  background: #9dcdb5;
  color: #fff;
}

.agreement-row input:focus-visible + .custom-checkbox {
  outline: 3px solid rgb(157 205 181 / 22%);
}

.form-alert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(241 179 143 / 12%);
  color: #aa674c;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.55;
}

.form-alert svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.submit-button {
  position: relative;
  display: grid;
  min-height: 56px;
  margin-top: 5px;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: var(--auth-peach);
  color: var(--auth-peach-dark);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow:
    0 13px 26px rgb(229 156 118 / 22%),
    inset 0 1px 0 rgb(255 255 255 / 38%);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease;
}

.submit-button--register {
  background: #b8ddca;
  color: #436253;
  box-shadow:
    0 13px 26px rgb(132 180 156 / 20%),
    inset 0 1px 0 rgb(255 255 255 / 38%);
}

.submit-label,
.submit-hover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.submit-hover {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: #7fae97;
  color: #fff;
  opacity: 0;
  transform: translateY(7px);
}

.submit-button--register .submit-hover {
  background: #8ac1a6;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: saturate(1.03);
  box-shadow:
    0 17px 30px rgb(219 146 108 / 24%),
    inset 0 1px 0 rgb(255 255 255 / 42%);
}

.submit-button:hover:not(:disabled) .submit-label {
  opacity: 0;
  transform: translateY(-7px);
}

.submit-button:hover:not(:disabled) .submit-hover {
  opacity: 1;
  transform: translateY(0);
}

.submit-button:active:not(:disabled) {
  transform: translateY(0);
}

.submit-button:disabled {
  cursor: wait;
  filter: saturate(0.78);
  opacity: 0.76;
}

.spinner {
  animation: spin 900ms linear infinite;
}

@keyframes blink {
  0%,
  45%,
  49%,
  100% {
    transform: scaleY(1);
  }

  47% {
    transform: scaleY(0.12);
  }
}

@keyframes shake-head {
  0%,
  100% {
    translate: 0 0;
  }

  18% {
    translate: -8px 0;
  }

  36% {
    translate: 7px 0;
  }

  54% {
    translate: -5px 0;
  }

  72% {
    translate: 3px 0;
  }

  88% {
    translate: -1px 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .characters {
    transform: scale(0.82);
  }
}

@media (max-width: 980px) {
  .auth-page {
    display: block;
  }

  .visual-panel {
    display: none;
  }

  .form-side {
    min-height: 100svh;
    padding: 24px;
  }
}

@media (max-width: 640px) {
  .form-side {
    place-items: start center;
    padding: 34px 20px 24px;
  }

  .auth-tabs {
    margin-bottom: 30px;
  }

  .input-shell {
    min-height: 53px;
    border-radius: 17px;
  }

  .submit-button {
    min-height: 53px;
  }
}

@media (max-width: 390px) {
  .auth-tabs {
    gap: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .character,
  .eyes,
  .pupil,
  .bare-pupil,
  .straight-mouth {
    transition: none;
  }
}
</style>
