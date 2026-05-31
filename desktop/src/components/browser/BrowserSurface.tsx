import { useEffect, useLayoutEffect, useRef } from 'react'
import { Camera, MousePointer2 } from 'lucide-react'
import { BrowserAddressBar } from './BrowserAddressBar'
import { computeWebviewBounds } from './computeWebviewBounds'
import { previewBridge } from '../../lib/previewBridge'
import { subscribePreviewEvents } from '../../lib/previewEvents'
import { useBrowserPanelStore } from '../../stores/browserPanelStore'
import { useOverlayStore } from '../../stores/overlayStore'

export function BrowserSurface({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const session = useBrowserPanelStore((s) => s.bySession[sessionId])
  const store = useBrowserPanelStore.getState()
  const overlayCount = useOverlayStore((s) => s.count)

  const reportBounds = () => {
    const el = hostRef.current
    if (!el) return
    previewBridge.setBounds(computeWebviewBounds(el.getBoundingClientRect()))
  }

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el || !session?.url) return
    previewBridge.open(session.url, computeWebviewBounds(el.getBoundingClientRect()))
    // The visibility-sync effect below owns setVisible() — including the
    // initial reveal — so it always factors in overlayCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Visibility-sync: a fullscreen DOM overlay (e.g. ImageGalleryModal) would
  // otherwise be partially covered by the native child webview, which always
  // renders above the DOM. While overlayCount > 0 we hide the webview; when
  // it returns to 0 (and we're still mounted in browser mode) we re-show it.
  // The Workbench-mode unmount teardown effect below still runs on unmount.
  useEffect(() => {
    if (!session) return
    previewBridge.setVisible(overlayCount === 0)
  }, [overlayCount, session])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => reportBounds())
    ro.observe(el)
    window.addEventListener('resize', reportBounds)
    return () => { ro.disconnect(); window.removeEventListener('resize', reportBounds) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    let unsub: (() => void) | undefined
    void subscribePreviewEvents(sessionId).then((u) => { unsub = u })
    return () => { unsub?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => () => { previewBridge.setVisible(false) }, [])

  // 兜底：navigated/ready 依赖注入脚本，若外站 CSP 拦截则永不回灌。loading 变 true 后 ~15s 强制收尾。
  const isLoading = session?.loading ?? false
  const currentUrl = session?.url
  useEffect(() => {
    if (!isLoading) return
    const timer = window.setTimeout(() => {
      useBrowserPanelStore.getState().setLoading(sessionId, false)
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [isLoading, currentUrl, sessionId])

  if (!session) return null

  const openOrNavigate = (url: string) => {
    if (!url) return
    const current = useBrowserPanelStore.getState().bySession[sessionId]
    store.navigate(sessionId, url)
    if (current?.url) {
      previewBridge.navigate(url)
      return
    }
    const el = hostRef.current
    if (el) {
      previewBridge.open(url, computeWebviewBounds(el.getBoundingClientRect()))
    } else {
      previewBridge.navigate(url)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <BrowserAddressBar
        url={session.url}
        canGoBack={session.canGoBack}
        canGoForward={session.canGoForward}
        loading={session.loading}
        onNavigate={openOrNavigate}
        onBack={() => { store.goBack(sessionId); store.setLoading(sessionId, true); previewBridge.navigate(useBrowserPanelStore.getState().bySession[sessionId]!.url) }}
        onForward={() => { store.goForward(sessionId); store.setLoading(sessionId, true); previewBridge.navigate(useBrowserPanelStore.getState().bySession[sessionId]!.url) }}
        onReload={() => {
          if (!session.url) return
          store.setLoading(sessionId, true)
          previewBridge.navigate(session.url)
        }}
      />
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <button
          aria-label="截图"
          className="rounded p-1 hover:bg-muted"
          onClick={() => previewBridge.eval(`window.__PREVIEW_BRIDGE__?.handleHostRaw('{"v":1,"type":"capture","kind":"full"}')`)}
        >
          <Camera size={16} />
        </button>
        <button
          aria-label="选择元素"
          aria-pressed={Boolean(session.pickerActive)}
          className={`rounded p-1 hover:bg-muted ${session.pickerActive ? 'bg-muted text-primary' : ''}`}
          onClick={() => {
            const cur = useBrowserPanelStore.getState().bySession[sessionId]
            const next = !cur?.pickerActive
            store.setPicker(sessionId, next)
            previewBridge.eval(`window.__PREVIEW_BRIDGE__?.handleHostRaw('{"v":1,"type":"${next ? 'enter-picker' : 'exit-picker'}"}')`)
          }}
        >
          <MousePointer2 size={16} />
        </button>
      </div>
      <div ref={hostRef} className="flex-1" data-testid="preview-host" />
    </div>
  )
}
