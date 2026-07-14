<template>
  <!-- Inline SVG (not an <img> or data: URL) so it renders under the SPA's strict
       CSP without needing an img-src exemption. -->
  <div class="qr" v-html="svg" aria-label="QR code" role="img"></div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = withDefaults(defineProps<{ value: string; size?: number }>(), { size: 200 })
const svg = ref('')

async function render(v: string) {
  if (!v) {
    svg.value = ''
    return
  }
  try {
    // Medium error-correction: robust to a bit of camera noise while keeping the
    // module count low enough to scan for a ~150-char otpauth URI.
    svg.value = await QRCode.toString(v, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: props.size,
    })
  } catch {
    svg.value = ''
  }
}

watch(() => props.value, render, { immediate: true })
</script>

<style scoped>
.qr {
  display: inline-block;
  line-height: 0;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.qr :deep(svg) {
  display: block;
  width: v-bind('props.size + "px"');
  height: v-bind('props.size + "px"');
}
</style>
