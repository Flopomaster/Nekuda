/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// SPA: serve index.html for app routes when offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('install', () => { void self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

self.addEventListener('push', (event) => {
  const data = (() => {
    try { return event.data?.json() ?? {} } catch { return { body: event.data?.text() } }
  })() as { title?: string; body?: string; url?: string; tag?: string }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'נקודה', {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'he',
      dir: 'rtl',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await (client as WindowClient).navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
