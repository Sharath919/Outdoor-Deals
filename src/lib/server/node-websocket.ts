import WebSocket from 'ws'

/** Supabase Realtime needs WebSocket; Node 20 requires the ws package. */
export function ensureNodeWebSocket(): void {
  if (typeof globalThis.WebSocket !== 'undefined') return
  globalThis.WebSocket = WebSocket as unknown as typeof WebSocket
}
