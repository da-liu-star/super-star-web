import type { FieldErrors, LoginPayload, RegistrationValues } from '../types/auth'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateUsername(value: string): string | undefined {
  const username = value.trim()
  if (!username) {
    return '请输入用户名'
  }
  if (!USERNAME_PATTERN.test(username)) {
    return '用户名需为 3-20 位字母、数字或下划线'
  }
  return undefined
}

export function validatePassword(value: string): string | undefined {
  if (!value) {
    return '请输入密码'
  }
  if (value.length < 6) {
    return '密码至少需要 6 个字符'
  }
  if (value.length > 64) {
    return '密码不能超过 64 个字符'
  }
  return undefined
}

export function validateNickname(value: string): string | undefined {
  if (value.trim().length > 64) {
    return '昵称不能超过 64 个字符'
  }
  return undefined
}

export function validateEmail(value: string): string | undefined {
  const email = value.trim()
  if (!email) {
    return undefined
  }
  if (email.length > 128 || !EMAIL_PATTERN.test(email)) {
    return '请输入有效的邮箱地址'
  }
  return undefined
}

export function validateLogin(values: LoginPayload): FieldErrors {
  return compactErrors({
    username: values.username.trim() ? undefined : '请输入用户名',
    password: values.password ? undefined : '请输入密码',
  })
}

export function validateRegistration(values: RegistrationValues): FieldErrors {
  const errors: FieldErrors = compactErrors({
    username: validateUsername(values.username),
    nickname: validateNickname(values.nickname),
    email: validateEmail(values.email),
    password: validatePassword(values.password),
  })

  if (!values.confirmPassword) {
    errors.confirmPassword = '请再次输入密码'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = '两次输入的密码不一致'
  }

  return errors
}

function compactErrors(errors: FieldErrors): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => Boolean(message)),
  ) as FieldErrors
}
