# FileEngine Frontend - File Browser and Drag-and-Drop Upload Interface Design

## Overview

This document details the design of the file browser and drag-and-drop upload interface for the FileEngine frontend. The design emphasizes usability, performance, and seamless integration with the FileEngine backend API.

## File Browser Design

### File Browser Component Structure

```
FileBrowser/
├── FileBrowser.vue           # Main container component
├── FileBreadcrumb.vue        # Path navigation
├── FileToolbar.vue           # Action toolbar
├── FileView.vue              # Abstraction for list/grid view
├── FileListView.vue          # List view implementation
├── FileGridView.vue          # Grid view implementation
├── FileItem.vue              # Individual file/directory item
├── ContextMenu.vue           # Right-click context menu
└── SelectionManager.vue      # Multi-selection handling
```

### Main File Browser Component

```vue
<!-- components/files/FileBrowser.vue -->
<template>
  <div class="file-browser">
    <FileBreadcrumb 
      :path="currentPath" 
      @navigate="navigateTo"
    />
    
    <FileToolbar
      :selected-count="selectedItems.length"
      :current-view="currentView"
      @create-directory="showCreateDirectoryModal"
      @toggle-view="toggleView"
      @selection-action="handleSelectionAction"
      @upload="showUploadArea"
    />
    
    <div class="file-browser-content">
      <FileView
        :items="items"
        :view-type="currentView"
        :selected-items="selectedItems"
        @item-selected="selectItem"
        @item-double-clicked="handleItemAction"
        @context-menu="showContextMenu"
        @item-action="handleItemAction"
      />
    </div>
    
    <ContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :item="contextMenu.item"
      @action="handleContextAction"
      @close="hideContextMenu"
    />
    
    <div 
      v-if="showDropOverlay" 
      class="drop-overlay"
    >
      <div class="drop-indicator">
        <i class="upload-icon"></i>
        <p>Drop files to upload</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useFileStore } from '@/stores/files';
import { useUploadStore } from '@/stores/upload';
import FileBreadcrumb from './FileBreadcrumb.vue';
import FileToolbar from './FileToolbar.vue';
import FileView from './FileView.vue';
import ContextMenu from './ContextMenu.vue';

const fileStore = useFileStore();
const uploadStore = useUploadStore();

const currentView = ref('grid'); // 'list' or 'grid'
const showDropOverlay = ref(false);
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null
});

// Computed properties
const currentPath = computed(() => fileStore.currentPath);
const items = computed(() => fileStore.currentDirectoryItems);
const selectedItems = computed(() => fileStore.selectedItems);

// Methods
const toggleView = () => {
  currentView.value = currentView.value === 'list' ? 'grid' : 'list';
};

const navigateTo = async (path) => {
  await fileStore.navigateTo(path);
};

const selectItem = (item, isCtrlClick = false) => {
  fileStore.selectItem(item, isCtrlClick);
};

const handleItemAction = async (action, item) => {
  switch (action) {
    case 'open':
      if (item.isDirectory) {
        await navigateTo(`${currentPath.value}/${item.name}`);
      } else {
        // Open file preview
        fileStore.openPreview(item);
      }
      break;
    case 'delete':
      if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
        await fileStore.deleteItem(item.id);
      }
      break;
    case 'rename':
      const newName = prompt('Enter new name:', item.name);
      if (newName && newName !== item.name) {
        await fileStore.renameItem(item.id, newName);
      }
      break;
    case 'download':
      await fileStore.downloadItem(item.id);
      break;
  }
};

const handleSelectionAction = (action) => {
  switch (action) {
    case 'delete':
      const confirmMsg = selectedItems.value.length === 1
        ? `Are you sure you want to delete "${selectedItems.value[0].name}"?`
        : `Are you sure you want to delete ${selectedItems.value.length} items?`;
      
      if (confirm(confirmMsg)) {
        selectedItems.value.forEach(async item => {
          await fileStore.deleteItem(item.id);
        });
      }
      break;
  }
};

const showContextMenu = (event, item) => {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item
  };
};

const hideContextMenu = () => {
  contextMenu.value.visible = false;
};

const handleContextAction = async (action, item) => {
  await handleItemAction(action, item);
  hideContextMenu();
};

const showCreateDirectoryModal = () => {
  // Show create directory modal
  const name = prompt('Enter directory name:');
  if (name) {
    fileStore.createDirectory(name);
  }
};

const showUploadArea = () => {
  // Show upload area within the file browser
  uploadStore.setTargetDirectory(fileStore.currentDirectoryUid);
  uploadStore.showUploadModal = true;
};

// Drag and drop event handlers
const handleDragOver = (event) => {
  event.preventDefault();
  showDropOverlay.value = true;
};

const handleDragLeave = (event) => {
  // Only hide if leaving the entire browser area
  const rect = event.currentTarget.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    showDropOverlay.value = false;
  }
};

const handleDrop = async (event) => {
  event.preventDefault();
  showDropOverlay.value = false;
  
  const files = Array.from(event.dataTransfer.files);
  if (files.length > 0) {
    await uploadStore.uploadFiles(files, fileStore.currentDirectoryUid);
  }
};

onMounted(() => {
  // Set up global drag and drop event listeners
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    showDropOverlay.value = true;
  });
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);
  
  // Initialize browser with root directory
  navigateTo('/');
});

// Cleanup event listeners
onUnmounted(() => {
  document.removeEventListener('dragover', handleDragOver);
  document.removeEventListener('dragenter', () => {});
  document.removeEventListener('dragleave', handleDragLeave);
  document.removeEventListener('drop', handleDrop);
});
</script>

<style scoped>
.file-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.file-browser-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
  position: relative;
}

.drop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.drop-indicator {
  background: white;
  padding: 40px;
  border-radius: 8px;
  text-align: center;
  border: 2px dashed #007bff;
}

.drop-indicator i {
  font-size: 48px;
  margin-bottom: 16px;
  color: #007bff;
}
</style>
```

### File Toolbar Component

```vue
<!-- components/files/FileToolbar.vue -->
<template>
  <div class="file-toolbar">
    <div class="toolbar-left">
      <button 
        class="btn-primary" 
        @click="emit('create-directory')"
        :disabled="!canCreate"
      >
        <i class="create-icon"></i>
        New Folder
      </button>
      
      <button 
        class="btn-success" 
        @click="emit('upload')"
        :disabled="!canUpload"
      >
        <i class="upload-icon"></i>
        Upload
      </button>
    </div>
    
    <div class="toolbar-center">
      <div class="search-container">
        <input 
          type="text" 
          placeholder="Search files..." 
          v-model="searchQuery"
          class="search-input"
        />
        <i class="search-icon"></i>
      </div>
    </div>
    
    <div class="toolbar-right">
      <div 
        v-if="selectedCount > 0" 
        class="selection-summary"
      >
        {{ selectedCount }} selected
        <button 
          class="btn-danger btn-small" 
          @click="emit('selection-action', 'delete')"
        >
          Delete
        </button>
        <button 
          class="btn-secondary btn-small" 
          @click="clearSelection"
        >
          Clear
        </button>
      </div>
      
      <button 
        class="view-toggle-btn"
        @click="toggleView"
        title="Toggle view mode"
      >
        <i :class="currentView === 'list' ? 'grid-view-icon' : 'list-view-icon'"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

const emit = defineEmits(['create-directory', 'upload', 'toggle-view', 'selection-action']);

const props = defineProps({
  selectedCount: {
    type: Number,
    default: 0
  },
  currentView: {
    type: String,
    default: 'grid'
  }
});

const searchQuery = ref('');
const authStore = useAuthStore();

// Computed properties
const canCreate = computed(() => {
  return authStore.hasAccessLevel('user');
});
const canUpload = computed(() => {
  return authStore.hasAccessLevel('user');
});

const toggleView = () => {
  emit('toggle-view');
};

const clearSelection = () => {
  // This will be handled by the parent component
};

// Watch for search changes
watch(searchQuery, (newQuery) => {
  // TODO: Implement search functionality
});
</script>

<style scoped>
.file-toolbar {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  gap: 16px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.search-container {
  position: relative;
  width: 300px;
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
}

.selection-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: #e3f2fd;
  border-radius: 16px;
  color: #1976d2;
}

.view-toggle-btn {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}
</style>
```

### File View Component (Abstraction)

```vue
<!-- components/files/FileView.vue -->
<template>
  <div class="file-view">
    <FileListView 
      v-if="viewType === 'list'"
      :items="items"
      :selected-items="selectedItems"
      @item-selected="emit('item-selected', $event)"
      @item-double-clicked="emit('item-double-clicked', $event)"
      @item-action="emit('item-action', $event)"
    />
    <FileGridView 
      v-else
      :items="items"
      :selected-items="selectedItems"
      @item-selected="emit('item-selected', $event)"
      @item-double-clicked="emit('item-double-clicked', $event)"
      @context-menu="emit('context-menu', $event)"
      @item-action="emit('item-action', $event)"
    />
  </div>
</template>

<script setup>
import FileListView from './FileListView.vue';
import FileGridView from './FileGridView.vue';

defineProps({
  items: {
    type: Array,
    required: true
  },
  viewType: {
    type: String,
    default: 'grid'
  },
  selectedItems: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits([
  'item-selected', 
  'item-double-clicked', 
  'context-menu', 
  'item-action'
]);
</script>
```

### File Grid View Component

```vue
<!-- components/files/FileGridView.vue -->
<template>
  <div class="file-grid">
    <div 
      v-for="item in items" 
      :key="item.id"
      class="grid-item"
      :class="{ 
        selected: isSelected(item),
        directory: item.isDirectory,
        file: !item.isDirectory
      }"
      @click="selectItem(item, $event)"
      @dblclick="emit('item-double-clicked', item)"
      @contextmenu.prevent="showContextMenu($event, item)"
      @keydown="handleKeydown($event, item)"
      tabindex="0"
    >
      <div class="item-icon">
        <i :class="getIconClass(item)"></i>
      </div>
      <div class="item-info">
        <div class="item-name">{{ item.name }}</div>
        <div class="item-meta" v-if="!item.isDirectory">
          {{ formatFileSize(item.size) }} • {{ formatDate(item.modified) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  items: {
    type: Array,
    required: true
  },
  selectedItems: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['item-selected', 'item-double-clicked', 'context-menu', 'item-action']);

// Computed properties
const selectedIds = computed(() => new Set(props.selectedItems.map(item => item.id)));

// Methods
const isSelected = (item) => selectedIds.value.has(item.id);

const selectItem = (item, event) => {
  const isCtrlClick = event.ctrlKey || event.metaKey;
  emit('item-selected', item, isCtrlClick);
};

const showContextMenu = (event, item) => {
  emit('context-menu', event, item);
};

const handleKeydown = (event, item) => {
  switch (event.key) {
    case 'Enter':
      emit('item-double-clicked', item);
      break;
    case 'Delete':
      emit('item-action', 'delete', item);
      break;
    case 'F2':
      event.preventDefault();
      emit('item-action', 'rename', item);
      break;
  }
};

const getIconClass = (item) => {
  if (item.isDirectory) return 'folder-icon';
  
  // Determine icon based on file extension
  const ext = item.name.split('.').pop().toLowerCase();
  const iconMap = {
    'pdf': 'pdf-icon',
    'doc': 'doc-icon',
    'docx': 'doc-icon',
    'xls': 'xls-icon',
    'xlsx': 'xls-icon',
    'ppt': 'ppt-icon',
    'pptx': 'ppt-icon',
    'jpg': 'image-icon',
    'jpeg': 'image-icon',
    'png': 'image-icon',
    'gif': 'image-icon',
    'mp4': 'video-icon',
    'avi': 'video-icon',
    'mp3': 'audio-icon',
    'zip': 'archive-icon',
    'rar': 'archive-icon',
    'txt': 'text-icon'
  };
  
  return iconMap[ext] || 'file-icon';
};

const formatFileSize = (size) => {
  if (!size) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let fileSize = size;
  
  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }
  
  return `${fileSize.toFixed(1)} ${units[unitIndex]}`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};
</script>

<style scoped>
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  padding: 8px 0;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  text-align: center;
  position: relative;
}

.grid-item:hover {
  background: #f5f5f5;
}

.grid-item.selected {
  background: #e3f2fd;
  outline: 2px solid #2196f3;
}

.item-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.item-info {
  width: 100%;
}

.item-name {
  font-weight: 500;
  font-size: 14px;
  word-break: break-word;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
```

## Drag-and-Drop Upload Interface

### Upload Area Component

```vue
<!-- components/upload/UploadArea.vue -->
<template>
  <div 
    class="upload-area-container"
    @dragover.prevent="handleDragOver"
    @dragenter.prevent="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="upload-area" :class="{ 'drag-over': isDragOver }">
      <div class="upload-content">
        <div class="upload-icon">
          <i class="upload-cloud-icon"></i>
        </div>
        <h3>Drag & Drop Files Here</h3>
        <p>or</p>
        <button 
          class="btn-primary upload-btn"
          @click="triggerFileInput"
        >
          Browse Files
        </button>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          @change="handleFileSelect"
          style="display: none"
        />
      </div>
    </div>
    
    <div class="upload-queue">
      <div v-for="upload in uploads" :key="upload.id" class="upload-item">
        <div class="upload-info">
          <div class="file-name">{{ upload.file.name }}</div>
          <div class="upload-status">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: upload.progress + '%' }"
              ></div>
            </div>
            <div class="progress-text">{{ upload.progress }}%</div>
          </div>
        </div>
        <button 
          class="cancel-btn"
          @click="cancelUpload(upload.id)"
          :disabled="upload.status === 'completed' || upload.status === 'failed'"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { useUploadStore } from '@/stores/upload';

const emit = defineEmits(['files-uploaded']);
const fileInputRef = ref(null);
const isDragOver = ref(false);
const uploads = ref([]);

const uploadStore = useUploadStore();

// Methods
const triggerFileInput = () => {
  fileInputRef.value.click();
};

const handleFileSelect = async (event) => {
  const files = Array.from(event.target.files);
  await processFiles(files);
};

const handleDragOver = (event) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragEnter = (event) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (event) => {
  // Only hide drag over if leaving the entire element
  const el = event.currentTarget;
  const relTarget = event.relatedTarget;
  
  if (!el.contains(relTarget)) {
    isDragOver.value = false;
  }
};

const handleDrop = async (event) => {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer.files);
  await processFiles(files);
};

const processFiles = async (files) => {
  if (files.length === 0) return;
  
  // Add files to upload queue
  for (const file of files) {
    const upload = {
      id: Date.now() + Math.random(),
      file,
      status: 'pending',
      progress: 0,
      targetDirectory: uploadStore.targetDirectory
    };
    
    uploads.value.push(upload);
    
    // Process upload asynchronously
    try {
      // Use uploadStore for actual upload
      await uploadStore.addFileToQueue(file, upload.targetDirectory, (progress) => {
        upload.progress = progress;
        if (progress === 100) {
          upload.status = 'completed';
        }
      });
    } catch (error) {
      upload.status = 'failed';
      upload.error = error.message;
      console.error('Upload failed:', error);
    }
  }
  
  // Emit completion when all uploads finish
  const checkCompletion = () => {
    const pendingUploads = uploads.value.filter(u => u.status === 'pending');
    if (pendingUploads.length === 0) {
      emit('files-uploaded');
    }
  };
  
  // Check periodically if all uploads completed
  const interval = setInterval(() => {
    const completed = uploads.value.filter(u => u.status === 'completed');
    const failed = uploads.value.filter(u => u.status === 'failed');
    
    if (completed.length + failed.length === uploads.value.length) {
      clearInterval(interval);
      checkCompletion();
    }
  }, 1000);
};

const cancelUpload = (uploadId) => {
  const upload = uploads.value.find(u => u.id === uploadId);
  if (upload) {
    upload.status = 'cancelled';
    // Remove from store queue if needed
    uploadStore.cancelUpload(uploadId);
  }
};
</script>

<style scoped>
.upload-area-container {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  transition: all 0.3s;
  background: #fafafa;
}

.upload-area.drag-over {
  border-color: #007bff;
  background: #f0f8ff;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.upload-icon {
  font-size: 48px;
  color: #666;
}

.upload-btn {
  padding: 12px 24px;
  font-size: 16px;
}

.upload-queue {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #eee;
}

.upload-info {
  flex: 1;
  margin-right: 16px;
}

.file-name {
  font-weight: 500;
  margin-bottom: 8px;
  word-break: break-word;
}

.upload-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007bff;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: #666;
  min-width: 40px;
  text-align: right;
}

.cancel-btn {
  padding: 6px 12px;
  font-size: 12px;
}
</style>
```

## Context Menu Component

```vue
<!-- components/files/ContextMenu.vue -->
<template>
  <teleport to="body">
    <div 
      class="context-menu"
      :style="{ top: y + 'px', left: x + 'px' }"
      @click.stop
    >
      <ul>
        <li v-if="item.isDirectory" @click="emit('action', 'open', item)">
          <i class="open-icon"></i>
          Open
        </li>
        <li v-else @click="emit('action', 'open', item)">
          <i class="preview-icon"></i>
          Preview
        </li>
        
        <li @click="emit('action', 'download', item)">
          <i class="download-icon"></i>
          Download
        </li>
        
        <li @click="emit('action', 'rename', item)">
          <i class="rename-icon"></i>
          Rename
        </li>
        
        <li class="divider"></li>
        
        <li @click="emit('action', 'delete', item)" class="danger">
          <i class="delete-icon"></i>
          Delete
        </li>
      </ul>
    </div>
  </teleport>
</template>

<script setup>
defineProps({
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  },
  item: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['action', 'close']);

// Close context menu when clicking outside
const closeOnOutsideClick = (event) => {
  const contextMenu = document.querySelector('.context-menu');
  if (contextMenu && !contextMenu.contains(event.target)) {
    emit('close');
  }
};

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', closeOnOutsideClick);
});
</script>

<style scoped>
.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10000;
  min-width: 180px;
}

.context-menu ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.context-menu li {
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu li:hover {
  background: #f5f5f5;
}

.context-menu li.divider {
  height: 1px;
  background: #eee;
  padding: 0;
  margin: 4px 0;
  cursor: default;
}

.context-menu li.danger {
  color: #f44336;
}

.context-menu li.danger:hover {
  background: #ffebee;
}
</style>
```

## Integration with File Store

### Enhanced File Store for Browser Operations

```javascript
// stores/files.js (Enhanced)
import { defineStore } from 'pinia';
import { fileService } from '@/services/fileService';
import { useUploadStore } from './upload';

export const useFileStore = defineStore('files', {
  state: () => ({
    currentPath: '/',
    currentDirectoryItems: [],
    loading: false,
    directoryCache: new Map(),
    selectedItems: [],
    viewMode: 'grid',
    breadcrumbs: [],
    previewItem: null,
    uploadProgress: new Map() // Track upload progress for each file
  }),
  
  getters: {
    currentDirectoryUid: (state) => {
      // Convert path to UID based on your path resolution logic
      return this.resolvePathToUid(state.currentPath);
    }
  },
  
  actions: {
    async navigateTo(path) {
      this.loading = true;
      try {
        // Check if we have this directory in cache
        if (this.directoryCache.has(path)) {
          this.currentDirectoryItems = this.directoryCache.get(path);
          this.breadcrumbs = this.generateBreadcrumbs(path);
        } else {
          const result = await fileService.listDirectory(this.resolvePathToUid(path));
          if (result.success) {
            this.currentDirectoryItems = result.data;
            this.directoryCache.set(path, result.data);
            this.breadcrumbs = this.generateBreadcrumbs(path);
          }
        }
        this.currentPath = path;
        this.clearSelection();
      } catch (error) {
        console.error('Failed to navigate to directory:', error);
      } finally {
        this.loading = false;
      }
    },
    
    async createDirectory(name) {
      if (!name || name.trim() === '') return;
      
      this.loading = true;
      try {
        const result = await fileService.createDirectory(
          this.currentDirectoryUid, 
          name.trim()
        );
        if (result.success) {
          // Refresh current directory
          await this.navigateTo(this.currentPath);
        }
      } catch (error) {
        console.error('Failed to create directory:', error);
      } finally {
        this.loading = false;
      }
    },
    
    async deleteItem(uid) {
      this.loading = true;
      try {
        const item = this.currentDirectoryItems.find(item => item.id === uid);
        if (!item) return;

        const result = item.isDirectory 
          ? await fileService.removeDirectory(uid)
          : await fileService.removeFile(uid);
        
        if (result.success) {
          // Remove from current directory items
          this.currentDirectoryItems = this.currentDirectoryItems.filter(item => item.id !== uid);
          // Clear selection if deleted item was selected
          this.selectedItems = this.selectedItems.filter(item => item.id !== uid);
        }
      } catch (error) {
        console.error('Failed to delete item:', error);
      } finally {
        this.loading = false;
      }
    },
    
    async renameItem(uid, newName) {
      if (!newName || newName.trim() === '') return;
      
      // This would require backend support for rename operation
      // For now, just log the intended action
      console.log(`Rename item ${uid} to ${newName}`);
      
      // Refresh directory to show changes
      await this.navigateTo(this.currentPath);
    },
    
    async downloadItem(uid) {
      try {
        const response = await fileService.getFile(uid);
        if (response.success) {
          // Create download link
          const blob = new Blob([response.data], { type: 'application/octet-stream' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = this.currentDirectoryItems.find(item => item.id === uid)?.name || 'file';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Failed to download file:', error);
      }
    },
    
    selectItem(item, isCtrlClick = false) {
      if (isCtrlClick) {
        const index = this.selectedItems.findIndex(i => i.id === item.id);
        if (index > -1) {
          this.selectedItems.splice(index, 1);
        } else {
          this.selectedItems.push(item);
        }
      } else {
        // Clear previous selection and select only this item
        this.selectedItems = [item];
      }
    },
    
    clearSelection() {
      this.selectedItems = [];
    },
    
    openPreview(item) {
      this.previewItem = item;
    },
    
    closePreview() {
      this.previewItem = null;
    },
    
    resolvePathToUid(path) {
      // Implement path to UID resolution based on your system
      // This is a placeholder implementation
      return path === '/' ? 'root-uid' : `uid-for-${path}`;
    },
    
    generateBreadcrumbs(path) {
      const pathParts = path.split('/').filter(p => p);
      const breadcrumbs = [{ name: 'Home', path: '/', id: 'root-uid' }];
      
      let currentPath = '';
      for (const part of pathParts) {
        currentPath += '/' + part;
        breadcrumbs.push({ 
          name: part, 
          path: currentPath,
          id: this.resolvePathToUid(currentPath)
        });
      }
      
      return breadcrumbs;
    },
    
    refreshCurrentDirectory() {
      // Remove from cache to force reload
      this.directoryCache.delete(this.currentPath);
      return this.navigateTo(this.currentPath);
    },
    
    // Handle drag-and-drop upload completion
    async handleUploadComplete(fileInfo) {
      // Refresh current directory to show the uploaded file
      await this.refreshCurrentDirectory();
    }
  }
});
```

## Upload Store for Progress Tracking

```javascript
// stores/upload.js
import { defineStore } from 'pinia';
import { uploadService } from '@/services/uploadService';

export const useUploadStore = defineStore('upload', {
  state: () => ({
    uploadQueue: [],
    targetDirectory: null,
    showUploadModal: false,
    isUploading: false
  }),
  
  actions: {
    setTargetDirectory(directoryUid) {
      this.targetDirectory = directoryUid;
    },
    
    async addFileToQueue(file, directoryUid, onProgress) {
      const uploadId = Date.now() + Math.random();
      
      // Add to queue
      this.uploadQueue.push({
        id: uploadId,
        file,
        directory: directoryUid || this.targetDirectory,
        status: 'pending',
        progress: 0
      });
      
      // Process upload
      try {
        const result = await uploadService.directUpload(
          file, 
          directoryUid || this.targetDirectory,
          onProgress
        );
        
        // Update upload status
        const upload = this.uploadQueue.find(u => u.id === uploadId);
        if (upload) {
          upload.status = 'completed';
          upload.progress = 100;
        }
        
        return result;
      } catch (error) {
        const upload = this.uploadQueue.find(u => u.id === uploadId);
        if (upload) {
          upload.status = 'failed';
          upload.error = error.message;
        }
        
        throw error;
      }
    },
    
    async uploadFiles(files, directoryUid) {
      this.isUploading = true;
      
      try {
        for (const file of files) {
          await this.addFileToQueue(
            file, 
            directoryUid,
            (progress) => {
              // Update progress in the UI
              const upload = this.uploadQueue.find(u => u.file.name === file.name);
              if (upload) {
                upload.progress = progress;
              }
            }
          );
        }
      } finally {
        this.isUploading = false;
      }
    },
    
    cancelUpload(uploadId) {
      const upload = this.uploadQueue.find(u => u.id === uploadId);
      if (upload) {
        upload.status = 'cancelled';
      }
    },
    
    removeUpload(uploadId) {
      this.uploadQueue = this.uploadQueue.filter(u => u.id !== uploadId);
    }
  }
});
```

## Accessibility and UX Enhancements

### Keyboard Navigation for File Browser

```javascript
// composables/useKeyboardNavigation.js
import { onMounted, onUnmounted } from 'vue';

export const useKeyboardNavigation = (items, selectedItems, selectItem) => {
  const handleKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        selectNextItem(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectNextItem(1);
        break;
      case ' ': // Spacebar
        event.preventDefault();
        if (items.value.length > 0) {
          const lastSelected = selectedItems.value[selectedItems.value.length - 1];
          if (lastSelected) {
            selectItem(lastSelected, true); // Toggle selection
          }
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedItems.value.length === 1) {
          // Trigger open action for the selected item
        }
        break;
      case 'Delete':
        event.preventDefault();
        if (selectedItems.value.length > 0) {
          // Trigger delete action for selected items
        }
        break;
    }
  };
  
  const selectNextItem = (direction) => {
    if (items.value.length === 0) return;
    
    const currentIndex = items.value.findIndex(item => 
      item.id === selectedItems.value[selectedItems.value.length - 1]?.id
    );
    
    let nextIndex;
    if (currentIndex === -1) {
      // No item is selected, select first
      nextIndex = direction > 0 ? 0 : items.value.length - 1;
    } else {
      nextIndex = currentIndex + direction;
      if (nextIndex < 0) nextIndex = items.value.length - 1;
      if (nextIndex >= items.value.length) nextIndex = 0;
    }
    
    if (items.value[nextIndex]) {
      selectItem(items.value[nextIndex], false);
    }
  };
  
  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });
  
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
  
  return {};
};
```

This comprehensive design provides a robust file browser with drag-and-drop upload functionality that integrates seamlessly with the FileEngine backend. The interface is responsive, accessible, and provides a smooth user experience with proper progress tracking and error handling.