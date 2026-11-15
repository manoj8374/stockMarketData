export const ApiStatus = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
} as const

export type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus]
