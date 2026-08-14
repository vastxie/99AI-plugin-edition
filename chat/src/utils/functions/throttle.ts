type ThrottledFunction<TThis, TArgs extends unknown[]> = (this: TThis, ...args: TArgs) => void

export function throttle<TThis, TArgs extends unknown[]>(
  func: ThrottledFunction<TThis, TArgs>,
  delay: number
): ThrottledFunction<TThis, TArgs> {
  let timeoutId: ReturnType<typeof setTimeout> | null
  let lastArgs: TArgs

  return function throttled(this: TThis, ...args: TArgs) {
    lastArgs = args

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        func.apply(this, lastArgs)
        timeoutId = null
      }, delay)
    }
  }
}
