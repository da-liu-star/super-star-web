import { describe, expect, it } from 'vitest'
import {
  validateEmail,
  validateLogin,
  validateRegistration,
  validateUsername,
} from './validation'

describe('auth form validation', () => {
  it('accepts a valid registration form', () => {
    expect(
      validateRegistration({
        username: 'damon_01',
        nickname: 'Damon',
        email: 'damon@example.com',
        password: '123456',
        confirmPassword: '123456',
      }),
    ).toEqual({})
  })

  it('rejects invalid usernames and malformed emails', () => {
    expect(validateUsername('ab')).toBeTruthy()
    expect(validateUsername('invalid name')).toBeTruthy()
    expect(validateEmail('not-an-email')).toBeTruthy()
  })

  it('reports mismatched passwords', () => {
    expect(
      validateRegistration({
        username: 'damon_01',
        nickname: '',
        email: '',
        password: '123456',
        confirmPassword: '654321',
      }).confirmPassword,
    ).toBe('两次输入的密码不一致')
  })

  it('requires both login fields', () => {
    expect(validateLogin({ username: '', password: '' })).toEqual({
      username: '请输入用户名',
      password: '请输入密码',
    })
  })
})
