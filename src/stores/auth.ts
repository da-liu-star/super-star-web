import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, authMode } from '../services/auth-api'
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from '../types/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const initialized = ref(false)
  const pending = ref(false)
  const restoreError = ref('')

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(
    () => user.value?.nickname?.trim() || user.value?.username || '',
  )

  async function restoreSession(): Promise<void> {
    if (initialized.value) {
      return
    }
    restoreError.value = ''
    try {
      user.value = await authApi.getSession()
    } catch (error) {
      restoreError.value = error instanceof Error ? error.message : '会话恢复失败'
    } finally {
      initialized.value = true
    }
  }

  async function login(payload: LoginPayload): Promise<AuthUser> {
    pending.value = true
    try {
      user.value = await authApi.login(payload)
      initialized.value = true
      return user.value
    } finally {
      pending.value = false
    }
  }

  async function register(payload: RegisterPayload): Promise<AuthUser> {
    pending.value = true
    try {
      await authApi.register(payload)
      user.value = await authApi.login({
        username: payload.username,
        password: payload.password,
      })
      initialized.value = true
      return user.value
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    pending.value = true
    try {
      await authApi.logout()
    } finally {
      user.value = null
      initialized.value = true
      pending.value = false
    }
  }

  return {
    user,
    initialized,
    pending,
    restoreError,
    isAuthenticated,
    displayName,
    mode: authMode,
    restoreSession,
    login,
    register,
    logout,
  }
})
