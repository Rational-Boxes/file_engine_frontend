<template>
  <div class="file-browser">
    <div class="browser-header">
      <h2>File Browser</h2>
      <div class="browser-actions">
        <button @click="createDirectory" :disabled="!canCreate" class="btn-primary">
          New Folder
        </button>
        <button @click="showUploadArea" :disabled="!canUpload" class="btn-success">
          Upload
        </button>
      </div>
    </div>
    
    <div v-if="loading" class="loading">
      Loading...
    </div>
    
    <div v-else class="file-list">
      <div 
        v-for="item in currentDirectoryItems" 
        :key="item.id"
        class="file-item"
        :class="{ selected: isSelected(item) }"
        @click="selectItem(item)"
      >
        <span class="item-icon">{{ item.isDirectory ? '📁' : '📄' }}</span>
        <span class="item-name">{{ item.name }}</span>
        <span v-if="!item.isDirectory" class="item-size">{{ item.size }} bytes</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore, FileItem } from '@/stores/files'
import { useAuthStore } from '@/stores/auth'

const fileStore = useFileStore()
const authStore = useAuthStore()

// Computed properties
const currentDirectoryItems = computed(() => fileStore.currentDirectoryItems)
const loading = computed(() => fileStore.loading)
const selectedItems = computed(() => fileStore.selectedItems)

// Permissions
const canCreate = computed(() => authStore.hasAccessLevel('user'))
const canUpload = computed(() => authStore.hasAccessLevel('user'))

// Methods
const isSelected = (item: FileItem) => {
  return selectedItems.value.some(i => i.id === item.id)
}

const selectItem = (item: FileItem) => {
  fileStore.selectItem(item)
}

const createDirectory = async () => {
  const name = prompt('Enter directory name:')
  if (name) {
    await fileStore.createDirectory(name)
  }
}

const showUploadArea = () => {
  // This would show an upload modal
  console.log('Show upload area')
}

// Initialize with root directory
fileStore.navigateTo('/')
</script>

<style scoped>
.file-browser {
  padding: 20px;
}

.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.browser-actions {
  display: flex;
  gap: 10px;
}

.btn-primary, .btn-success {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-success {
  background-color: #28a745;
  color: white;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 18px;
}

.file-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.file-item {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-item:hover {
  background-color: #f5f5f5;
}

.file-item.selected {
  background-color: #e3f2fd;
  border-color: #2196f3;
}

.item-icon {
  font-size: 20px;
}
</style>