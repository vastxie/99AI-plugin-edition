import banner from 'vite-plugin-banner'

export default function createBanner() {
  return banner(`
/**
 * 99AI Plugin Edition is distributed under the Apache License 2.0.
 * See LICENSE in the source distribution.
 */
`)
}
