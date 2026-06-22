<template>
  <div class="browser">
    <header class="topbar">
      <div class="brand">FileEngine</div>
      <div class="user">
        <span v-if="auth.user" class="who">{{ auth.user }} · {{ auth.tenant }}</span>
        <button class="link" @click="logout">Sign out</button>
      </div>
    </header>

    <div class="toolbar">
      <nav class="breadcrumbs">
        <template v-for="(c, i) in files.breadcrumbs" :key="c.uid + i">
          <button class="crumb" :disabled="i === files.breadcrumbs.length - 1" @click="files.navigateToCrumb(i)">
            {{ c.name }}
          </button>
          <span v-if="i < files.breadcrumbs.length - 1" class="sep">/</span>
        </template>
      </nav>
      <div class="actions">
        <button class="btn" @click="newFolder">New folder</button>
        <button class="btn btn-primary" @click="fileInput?.click()">Upload</button>
        <input ref="fileInput" type="file" multiple hidden @change="onUpload" />
      </div>
    </div>

    <p v-if="files.error" class="banner error">{{ files.error }}</p>

    <ul v-if="upload.queue.length" class="uploads">
      <li v-for="u in upload.queue" :key="u.id">
        <span class="up-name">{{ u.name }}</span>
        <span class="up-status" :class="u.status">
          {{ u.status === 'uploading' ? u.progress + '%' : u.status }}
        </span>
      </li>
    </ul>

    <div v-if="files.loading" class="empty">Loading…</div>
    <div v-else-if="!files.items.length" class="empty">This folder is empty.</div>

    <table v-else class="files">
      <thead>
        <tr><th>Name</th><th class="size">Size</th><th class="row-actions"></th></tr>
      </thead>
      <tbody>
        <tr v-for="item in files.items" :key="item.uid" @dblclick="open(item)">
          <td class="name" @click="open(item)">
            <span class="icon">{{ item.isDirectory ? '📁' : '📄' }}</span>{{ item.name }}
          </td>
          <td class="size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</td>
          <td class="row-actions">
            <button v-if="!item.isDirectory" class="link" @click.stop="files.downloadItem(item)">Download</button>
            <button class="link" @click.stop="rename(item)">Rename</button>
            <button class="link danger" @click.stop="remove(item)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFileStore, type FileItem } from '@/stores/files'
import { useUploadStore } from '@/stores/upload'

const router = useRouter()
const auth = useAuthStore()
const files = useFileStore()
const upload = useUploadStore()

const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => files.openRoot())

const open = (item: FileItem) => {
  if (item.isDirectory) files.openDirectory(item)
  else files.downloadItem(item)
}

const newFolder = async () => {
  const name = prompt('Folder name:')
  if (name) await files.createDirectory(name)
}

const rename = async (item: FileItem) => {
  const name = prompt('Rename to:', item.name)
  if (name) await files.renameItem(item, name)
}

const remove = async (item: FileItem) => {
  if (confirm(`Delete "${item.name}"?`)) await files.deleteItem(item)
}

const onUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    await upload.uploadFiles(files.currentUid, Array.from(input.files))
  }
  input.value = ''
}

const logout = async () => {
  await auth.logout()
  router.push('/login')
}

const formatSize = (bytes: number): string => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}
</script>

<style scoped>
.browser {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px 40px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
}

.brand {
  font-weight: 600;
  font-size: 18px;
}

.user {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
  flex-wrap: wrap;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.crumb {
  border: none;
  background: none;
  color: var(--primary);
  padding: 2px 4px;
  border-radius: 4px;
}

.crumb:disabled {
  color: var(--fg);
  cursor: default;
}

.sep {
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-weight: 500;
}

.btn:hover {
  background: var(--bg);
}

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.link {
  border: none;
  background: none;
  color: var(--primary);
  padding: 2px 6px;
}

.link.danger {
  color: var(--danger);
}

.banner.error {
  background: #fef2f2;
  color: var(--danger);
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0 0 12px;
}

.uploads {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.uploads li {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.uploads li:last-child {
  border-bottom: none;
}

.up-status.completed {
  color: #16a34a;
}

.up-status.failed {
  color: var(--danger);
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 48px 0;
}

.files {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.files th,
.files td {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.files th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.files tbody tr:last-child td {
  border-bottom: none;
}

.files tbody tr:hover {
  background: var(--bg);
}

.name {
  cursor: pointer;
}

.icon {
  margin-right: 8px;
}

.size {
  width: 120px;
  color: var(--muted);
}

.row-actions {
  width: 220px;
  text-align: right;
  white-space: nowrap;
}
</style>
