import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from '../types/auth'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface StoredUser extends AuthUser {
  passwordHash: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const MOCK_USERS_KEY = 'super-star.mock.users'
const MOCK_SESSION_KEY = 'super-star.mock.session'
const DEMO_USERNAME = 'admin'
const DEMO_PASSWORD = '123456'

export class AuthApiError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

export const authMode: 'api' | 'mock' =
  import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'api'

const httpApi = {
  async login(payload: LoginPayload): Promise<AuthUser> {
    return request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async register(payload: RegisterPayload): Promise<AuthUser> {
    return request<AuthUser>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getSession(): Promise<AuthUser | null> {
    try {
      return await request<AuthUser>('/api/auth/session')
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        return null
      }
      throw error
    }
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (!(error instanceof AuthApiError && error.status === 401)) {
        throw error
      }
    }
  },
}

const mockApi = {
  async login(payload: LoginPayload): Promise<AuthUser> {
    await ensureDemoUser()
    const username = payload.username.trim()
    const user = readUsers().find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    )
    const passwordHash = await hashPassword(username, payload.password)

    if (!user || user.passwordHash !== passwordHash) {
      throw new AuthApiError('用户名或密码不正确', 401)
    }

    const sessionUser = toAuthUser(user)
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(sessionUser))
    return sessionUser
  },

  async register(payload: RegisterPayload): Promise<AuthUser> {
    await ensureDemoUser()
    const username = payload.username.trim()
    const users = readUsers()
    if (
      users.some(
        (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
      )
    ) {
      throw new AuthApiError('该用户名已被注册', 409)
    }

    const user: StoredUser = {
      userId: Date.now(),
      username,
      nickname: payload.nickname?.trim() || username,
      email: payload.email?.trim() || null,
      avatarUrl: null,
      authorities: ['ROLE_USER'],
      passwordHash: await hashPassword(username, payload.password),
    }
    users.push(user)
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users))
    return toAuthUser(user)
  },

  async getSession(): Promise<AuthUser | null> {
    const stored = localStorage.getItem(MOCK_SESSION_KEY)
    if (!stored) {
      return null
    }
    try {
      const session = JSON.parse(stored) as AuthUser
      await ensureDemoUser()
      const exists = readUsers().some((user) => user.userId === session.userId)
      if (!exists) {
        localStorage.removeItem(MOCK_SESSION_KEY)
        return null
      }
      return session
    } catch {
      localStorage.removeItem(MOCK_SESSION_KEY)
      return null
    }
  },

  async logout(): Promise<void> {
    localStorage.removeItem(MOCK_SESSION_KEY)
  },
}

export const authApi = authMode === 'mock' ? mockApi : httpApi

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new AuthApiError('无法连接认证服务，请确认后端已启动')
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Some successful responses intentionally have no JSON body.
  }

  if (!response.ok) {
    throw new AuthApiError(extractMessage(payload, response.status), response.status)
  }

  if (isEnvelope<T>(payload)) {
    if (payload.code !== 0) {
      throw new AuthApiError(payload.message || '认证请求失败', response.status)
    }
    return payload.data
  }

  return payload as T
}

function isEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return Boolean(
    payload
      && typeof payload === 'object'
      && 'code' in payload
      && 'data' in payload,
  )
}

function extractMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  if (status === 401) {
    return '用户名或密码不正确'
  }
  return '认证请求失败，请稍后重试'
}

async function ensureDemoUser(): Promise<void> {
  if (readUsers().length > 0) {
    return
  }
  const demoUser: StoredUser = {
    userId: 1,
    username: DEMO_USERNAME,
    nickname: '系统管理员',
    email: 'admin@super-star.local',
    avatarUrl: null,
    authorities: ['ROLE_USER', 'ROLE_ADMIN'],
    passwordHash: await hashPassword(DEMO_USERNAME, DEMO_PASSWORD),
  }
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify([demoUser]))
}

function readUsers(): StoredUser[] {
  const stored = localStorage.getItem(MOCK_USERS_KEY)
  if (!stored) {
    return []
  }
  try {
    const parsed = JSON.parse(stored) as unknown
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : []
  } catch {
    localStorage.removeItem(MOCK_USERS_KEY)
    return []
  }
}

function toAuthUser(user: StoredUser): AuthUser {
  const { passwordHash: _passwordHash, ...authUser } = user
  return authUser
}

async function hashPassword(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(
    `${username.toLowerCase()}:${password}:super-star-local-demo`,
  )
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}
