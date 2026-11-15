export interface AuthUser {
  userId: number
  username: string
  nickname: string | null
  email: string | null
  avatarUrl: string | null
  authorities: string[]
}

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  password: string
  nickname?: string
  email?: string
}

export interface RegistrationValues {
  username: string
  nickname: string
  email: string
  password: string
  confirmPassword: string
}

export type FieldErrors = Partial<Record<keyof RegistrationValues, string>>
