export function trackPageView(path: string) {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', { page_path: path })
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params as Gtag.CustomParams)
}
