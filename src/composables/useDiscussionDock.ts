import { ref, computed, type Ref, type CSSProperties } from 'vue'

// Shared docking behaviour for an embedded discussion panel alongside a preview
// (document or 3D viewer): side/bottom orientation, minimize, a draggable divider,
// and per-orientation persisted sizes. The host provides `hasContent` (something to
// dock beside) and `enabled` (the surface is large enough to combine).

const POS_KEY = 'fe.discuss.previewPos'
const SIDE_KEY = 'fe.discuss.sideW'
const BOTTOM_KEY = 'fe.discuss.bottomPct'

function readNum(key: string, fallback: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) || '')
    return Number.isFinite(v) ? v : fallback
  } catch {
    return fallback
  }
}
function readPos(): 'side' | 'bottom' {
  try {
    return localStorage.getItem(POS_KEY) === 'bottom' ? 'bottom' : 'side'
  } catch {
    return 'side'
  }
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function useDiscussionDock(hasContent: Ref<boolean>, enabled: Ref<boolean>) {
  const discussionPos = ref<'side' | 'bottom'>(readPos())
  // Mirrors the embedded panel's own layout (via its @layout event).
  const discLayout = ref<'collapsed' | 'right' | 'bottom'>('right')
  const discSideW = ref(readNum(SIDE_KEY, 380)) // px
  const discBottomPct = ref(readNum(BOTTOM_KEY, 42)) // %
  const dragging = ref(false)
  let dragRect: DOMRect | null = null

  const combinedActive = computed(
    () => enabled.value && hasContent.value && discLayout.value !== 'collapsed',
  )

  const discStyle = computed<CSSProperties>(() => {
    if (!combinedActive.value) return {}
    return discussionPos.value === 'side'
      ? { flex: `0 0 ${discSideW.value}px`, width: `${discSideW.value}px` }
      : { flex: `0 0 ${discBottomPct.value}%` }
  })

  function setPos(p: 'side' | 'bottom') {
    discussionPos.value = p
    try {
      localStorage.setItem(POS_KEY, p)
    } catch {
      /* ignore */
    }
  }

  function startDrag(e: PointerEvent) {
    e.preventDefault()
    const combined = (e.currentTarget as HTMLElement).parentElement
    if (!combined) return
    dragRect = combined.getBoundingClientRect()
    dragging.value = true
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
  }
  function onDrag(e: PointerEvent) {
    if (!dragRect) return
    if (discussionPos.value === 'side') {
      const w = dragRect.right - e.clientX
      discSideW.value = Math.round(clamp(w, 260, Math.max(300, dragRect.width - 320)))
    } else {
      const pct = ((dragRect.bottom - e.clientY) / dragRect.height) * 100
      discBottomPct.value = Math.round(clamp(pct, 20, 75))
    }
  }
  function endDrag() {
    dragging.value = false
    dragRect = null
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
    try {
      localStorage.setItem(SIDE_KEY, String(discSideW.value))
      localStorage.setItem(BOTTOM_KEY, String(discBottomPct.value))
    } catch {
      /* ignore */
    }
  }

  return {
    discussionPos,
    discLayout,
    discSideW,
    discBottomPct,
    dragging,
    combinedActive,
    discStyle,
    setPos,
    startDrag,
  }
}
