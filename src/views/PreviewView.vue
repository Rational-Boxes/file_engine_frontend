<!--
  Copyright (C) 2026 James Hickman

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<template>
  <div class="preview-view">
    <AppNav />
    <main class="content">
      <button class="link back" @click="back">← Back</button>
      <div class="pv-titlebar">
        <h1 class="title">{{ name || uid }}</h1>
        <router-link v-if="canEdit" class="pv-edit" :to="`/edit/${uid}`">✎ Edit</router-link>
        <div id="pv-titlebar" class="pv-slot"></div>
      </div>
      <p v-if="error" class="err">{{ error }}</p>

      <p v-if="is3d" class="muted">Opening the 3D viewer…</p>
      <DocumentPreview v-else :uid="uid" :name="name" full-width titlebar="#pv-titlebar" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import { fileService } from '@/services/fileService'
import { useModel3dStore } from '@/stores/model3d'
import { is3DModel } from '@/utils/modelFormat'
import { isEditableOffice } from '@/utils/office'

const route = useRoute()
const router = useRouter()
const model3d = useModel3dStore()

const uid = computed(() => String(route.params.uid || ''))
const name = ref('')
const error = ref('')
const is3d = computed(() => is3DModel(name.value))
// Offer in-browser editing for office documents. If editing is disabled on the
// deployment the editor page surfaces that; the button just routes there.
const canEdit = computed(() => isEditableOffice(name.value))

watch(uid, load, { immediate: true })

async function load() {
  name.value = ''
  error.value = ''
  if (!uid.value) return
  // Name (for the title + native-PDF detection); best-effort.
  try {
    name.value = (await fileService.stat(uid.value)).name
  } catch {
    /* name is optional */
  }
  // 3D models open in the dedicated maximal viewer overlay, not DocumentPreview.
  if (is3DModel(name.value)) model3d.open(uid.value, name.value)
}

function back() {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back()
  else router.push('/files')
}
</script>

<style scoped>
.content {
  /* Full-width review so the PDF iframe spans the page. */
  max-width: none;
  margin: 0;
  padding: 12px 18px;
}

.back {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.pv-titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 16px;
}
.title {
  font-size: 18px;
  margin: 0;
  word-break: break-all;
  flex: 1 1 auto;
  min-width: 0;
}
.pv-slot {
  flex: 0 0 auto;
}
.pv-edit {
  flex: 0 0 auto;
  padding: 5px 12px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  color: var(--primary);
  text-decoration: none;
  font-size: 0.85rem;
  white-space: nowrap;
}
.pv-edit:hover {
  background: var(--primary);
  color: #fff;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>
