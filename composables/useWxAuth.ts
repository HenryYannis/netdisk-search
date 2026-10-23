/**
 * 微信公众号认证 composable（已禁用 - 直接放行）
 * 原作者版本强制关注公众号，定制版移除该限制。
 */

export function useWxAuth() {
  const isVerified = ref(true);
  const isReady = ref(true);

  async function checkSearchAuth(): Promise<boolean> {
    return true;
  }

  async function forceVerify(): Promise<boolean> {
    return true;
  }

  return {
    isVerified: computed(() => isVerified.value),
    isReady: computed(() => isReady.value),
    checkSearchAuth,
    forceVerify,
  };
}
