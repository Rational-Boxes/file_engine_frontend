<template>
  <div v-if="upload.queue.length" class="tray">
    <div class="tray-head">
      <span>
        Uploads
        <span v-if="upload.isUploading">· {{ upload.overallProgress }}%</span>
      </span>
      <button class="link" @click="upload.clearFinished()">Clear finished</button>
    </div>
    <div v-if="upload.isUploading" class="bar overall"><span :style="{ width: upload.overallProgress + '%' }" /></div>
    <ul class="items">
      <li v-for="u in upload.queue" :key="u.id">
        <div class="row">
          <span class="name" :title="u.name">{{ u.name }}</span>
          <span class="status" :class="u.status">
            {{ u.status === 'uploading' ? u.progress + '%' : u.status }}
          </span>
        </div>
        <div class="bar"><span :class="u.status" :style="{ width: u.progress + '%' }" /></div>
        <p v-if="u.error" class="err">{{ u.error }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useUploadStore } from '@/stores/upload'
const upload = useUploadStore()
</script>

<style scoped>
.tray {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 320px;
  max-height: 50vh;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 12px;
  z-index: 30;
}

.tray-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}

.link {
  border: none;
  background: none;
  color: var(--primary);
  font-size: 12px;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  gap: 8px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status.completed {
  color: #16a34a;
}

.status.failed {
  color: var(--danger);
}

.bar {
  height: 6px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}

.bar.overall {
  margin: 0 0 10px;
  height: 8px;
}

.bar > span {
  display: block;
  height: 100%;
  background: var(--primary);
  transition: width 0.15s ease;
}

.bar > span.completed {
  background: #16a34a;
}

.bar > span.failed {
  background: var(--danger);
}

.err {
  color: var(--danger);
  font-size: 12px;
  margin: 4px 0 0;
}
</style>
