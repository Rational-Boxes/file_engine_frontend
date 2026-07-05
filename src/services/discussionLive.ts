import { liveSocketUrl } from '@/services/discussionClient'

// Live panel channel (§10h): while a file's ThreadPanel is open, subscribe to
// comment events and the co-viewing presence roster. Mirrors chatService's
// ChatSession — a thin WebSocket wrapper. Enhancement-only: if it never connects,
// the panel still works from its initial load (the caller decides).

export interface LiveCommentEvent {
  type: 'comment'
  action: 'created' | 'updated' | 'deleted' | 'redacted'
  thread_id: string
  comment?: Record<string, unknown>
  comment_id?: string
}

export interface LiveThreadEvent {
  type: 'thread'
  action: 'resolved'
  thread_id: string
}

export interface LivePresenceEvent {
  type: 'presence'
  viewers: string[]
  count: number
}

export interface LiveHandlers {
  onComment?: (e: LiveCommentEvent) => void
  onThread?: (e: LiveThreadEvent) => void
  onPresence?: (e: LivePresenceEvent) => void
  onOpen?: () => void
  onClose?: () => void
}

export class LiveSession {
  private ws: WebSocket
  private closed = false

  constructor(
    fileUid: string,
    private handlers: LiveHandlers = {},
    socketFactory: (uid: string) => WebSocket = (uid) => new WebSocket(liveSocketUrl(uid)),
  ) {
    this.ws = socketFactory(fileUid)
    this.ws.onopen = () => this.handlers.onOpen?.()
    this.ws.onclose = () => {
      if (!this.closed) this.handlers.onClose?.()
    }
    this.ws.onmessage = (ev: MessageEvent) => this.dispatch(ev.data)
  }

  private dispatch(raw: unknown) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    } catch {
      return
    }
    switch (msg.type) {
      case 'comment':
        this.handlers.onComment?.(msg as unknown as LiveCommentEvent)
        break
      case 'thread':
        this.handlers.onThread?.(msg as unknown as LiveThreadEvent)
        break
      case 'presence':
        this.handlers.onPresence?.(msg as unknown as LivePresenceEvent)
        break
      // 'error' and anything else are ignored — the panel degrades to its load.
    }
  }

  close() {
    this.closed = true
    try {
      this.ws.close()
    } catch {
      /* already closing */
    }
  }
}
