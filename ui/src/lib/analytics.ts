function ga(...args: Parameters<Gtag.Gtag>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...args)
  }
}

export function trackPageView(path: string) {
  ga('event', 'page_view', { page_path: path })
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  ga('event', eventName, params)
}
