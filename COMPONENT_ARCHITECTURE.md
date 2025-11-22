# FileEngine Frontend - Vue3 Component Architecture

## Overview

This document outlines the component architecture for the FileEngine frontend built with Vue3 and TypeScript. The architecture ensures modularity, reusability, and maintainability while supporting the complex file management features required by the application.

## Component Structure

### Root Level Components
```
src/
├── App.vue                    # Root application component
├── main.js                    # Application entry point
├── router/
│   └── index.js               # Vue Router configuration
├── components/
│   ├── common/                # Reusable UI components
│   ├── auth/                  # Authentication-related components
│   ├── files/                 # File system components
│   ├── upload/                # Upload components
│   ├── admin/                 # Administrative components
│   └── layout/                # Layout components
├── composables/               # Vue composition functions
├── stores/                    # Pinia state management
└── views/                     # Page-level components
```

## Common Components

### Layout Components
```
components/layout/
├── MainLayout.vue            # Main application layout with sidebar, header, content
├── AuthLayout.vue            # Authentication-specific layout
└── PageContainer.vue         # Page content wrapper
```

```vue
<!-- components/layout/MainLayout.vue -->
<template>
  <div class="main-layout">
    <Header @toggle-sidebar="toggleSidebar" />
    <div class="main-layout-container">
      <Sidebar 
        v-if="showSidebar" 
        :user="user" 
        :access-level="accessLevel"
        @close="hideSidebar"
      />
      <main class="main-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import Header from './common/Header.vue';
import Sidebar from './common/Sidebar.vue';

const showSidebar = ref(true);
const authStore = useAuthStore();
const user = computed(() => authStore.user);
const accessLevel = computed(() => authStore.accessLevel);

const toggleSidebar = () => {
  showSidebar.value = !showSidebar.value;
};

const hideSidebar = () => {
  showSidebar.value = false;
};
</script>
```

### Base UI Components
```
components/common/
├── Header.vue                # Application header with user menu, branding
├── Sidebar.vue               # Navigation sidebar with access-level aware menu
├── FileBreadcrumb.vue        # Breadcrumb navigation for file paths
├── LoadingSpinner.vue        # Loading indicator component
├── Modal.vue                 # Reusable modal dialog component
├── Notification.vue          # Toast notification component
├── SearchBar.vue             # Global search functionality
└── UserAvatar.vue            # User profile avatar display
```

```vue
<!-- components/common/Header.vue -->
<template>
  <header class="app-header">
    <div class="header-left">
      <button class="menu-toggle" @click="emit('toggle-sidebar')">
        <i class="menu-icon" />
      </button>
      <div class="brand">
        <h1>FileEngine</h1>
      </div>
    </div>
    
    <div class="header-right">
      <SearchBar />
      <UserAvatar :user="user" />
      <div class="user-menu">
        <span class="user-name">{{ user?.username }}</span>
        <select v-model="accessLevel" @change="changeAccessLevel">
          <option 
            v-for="level in accessibleLevels" 
            :key="level" 
            :value="level"
          >
            {{ level }}
          </option>
        </select>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import SearchBar from './SearchBar.vue';
import UserAvatar from './UserAvatar.vue';

const emit = defineEmits(['toggle-sidebar']);

const authStore = useAuthStore();
const user = computed(() => authStore.user);
const accessLevel = computed({
  get: () => authStore.accessLevel,
  set: (value) => authStore.setAccessLevel(value)
});

// Determine accessible levels based on user roles
const accessibleLevels = computed(() => {
  if (!user.value) return [];
  
  // Based on user's roles and permissions
  const levels = ['user'];
  if (user.value.roles?.includes('admin')) levels.push('admin');
  if (user.value.roles?.includes('editor')) levels.push('editor');
  
  return levels;
});

const changeAccessLevel = (event) => {
  authStore.setAccessLevel(event.target.value);
};
</script>
```

## Authentication Components

### Auth Components Structure
```
components/auth/
├── LoginPage.vue             # Main login form
├── OAuth2Buttons.vue         # OAuth2 provider buttons
├── LoginForm.vue             # Local login form
├── RegisterForm.vue          # User registration
└── JWTManager.vue            # JWT token management
```

```vue
<!-- components/auth/LoginPage.vue -->
<template>
  <AuthLayout>
    <div class="login-container">
      <div class="login-card">
        <h2>Sign in to FileEngine</h2>
        
        <OAuth2Buttons 
          :providers="availableProviders"
          @oauth="handleOAuth"
        />
        
        <div class="divider">
          <span>or</span>
        </div>
        
        <LoginForm 
          @login="handleLogin"
          @register="showRegisterForm"
        />
      </div>
    </div>
  </AuthLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AuthLayout from '../layout/AuthLayout.vue';
import OAuth2Buttons from './OAuth2Buttons.vue';
import LoginForm from './LoginForm.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const availableProviders = ref([]);

onMounted(async () => {
  // Load available OAuth providers
  availableProviders.value = await authStore.getAvailableProviders();
});

const handleOAuth = async (provider) => {
  // Initiate OAuth flow
  await authStore.initiateOAuth(provider);
};

const handleLogin = async (credentials) => {
  try {
    await authStore.login(credentials);
    // Redirect to main application
    router.push('/');
  } catch (error) {
    // Handle login error
    console.error('Login failed:', error);
  }
};

const showRegisterForm = () => {
  // TODO: Implement registration flow
};
</script>
```

## File System Components

### File Browser Components
```
components/files/
├── FileBrowser.vue           # Main file browser component
├── FileList.vue              # File list display with sorting
├── FileGrid.vue              # File grid/tile view
├── FileCard.vue              # Individual file representation
├── DirectoryTree.vue         # Hierarchical directory view
├── FilePreview.vue           # File preview modal
├── VersionHistory.vue        # Version history component
├── FileProperties.vue        # File metadata display
└── ContextMenu.vue           # Right-click context menu
```

```vue
<!-- components/files/FileBrowser.vue -->
<template>
  <div class="file-browser">
    <div class="browser-header">
      <FileBreadcrumb 
        :path="currentPath" 
        @navigate="navigateTo"
      />
      <div class="browser-actions">
        <button @click="createDirectory" class="btn-primary">New Folder</button>
        <button @click="openUploadModal" class="btn-success">Upload</button>
        <select v-model="viewMode" class="view-mode-selector">
          <option value="list">List</option>
          <option value="grid">Grid</option>
        </select>
      </div>
    </div>
    
    <div class="browser-content">
      <template v-if="loading">
        <LoadingSpinner />
      </template>
      <template v-else>
        <FileList 
          v-if="viewMode === 'list'"
          :items="items"
          :selected-items="selectedItems"
          @select="selectItem"
          @action="handleItemAction"
        />
        <FileGrid 
          v-else
          :items="items"
          :selected-items="selectedItems"
          @select="selectItem"
          @action="handleItemAction"
        />
      </template>
    </div>
    
    <Modal v-if="showUploadModal" @close="closeUploadModal" class="upload-modal">
      <UploadArea @files-uploaded="onFilesUploaded" @close="closeUploadModal" />
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useFileStore } from '@/stores/files';
import FileBreadcrumb from '../common/FileBreadcrumb.vue';
import FileList from './FileList.vue';
import FileGrid from './FileGrid.vue';
import UploadArea from '../upload/UploadArea.vue';
import Modal from '../common/Modal.vue';
import LoadingSpinner from '../common/LoadingSpinner.vue';

const fileStore = useFileStore();
const viewMode = ref('list');
const showUploadModal = ref(false);
const selectedItems = ref([]);

// Computed properties
const currentPath = computed(() => fileStore.currentPath);
const items = computed(() => fileStore.currentDirectoryItems);
const loading = computed(() => fileStore.loading);

// Methods
const navigateTo = async (path) => {
  await fileStore.navigateTo(path);
};

const createDirectory = async () => {
  const name = prompt('Enter directory name:');
  if (name) {
    await fileStore.createDirectory(name);
  }
};

const openUploadModal = () => {
  showUploadModal.value = true;
};

const closeUploadModal = () => {
  showUploadModal.value = false;
};

const onFilesUploaded = () => {
  // Refresh current directory after upload
  fileStore.refreshCurrentDirectory();
  closeUploadModal();
};

const selectItem = (item) => {
  const index = selectedItems.value.findIndex(i => i.id === item.id);
  if (index > -1) {
    selectedItems.value.splice(index, 1);
  } else {
    selectedItems.value.push(item);
  }
};

const handleItemAction = (action, item) => {
  switch (action) {
    case 'delete':
      fileStore.deleteItem(item.id);
      break;
    case 'rename':
      fileStore.renameItem(item.id, prompt('Enter new name:', item.name));
      break;
    case 'download':
      fileStore.downloadItem(item.id);
      break;
    case 'preview':
      // Open preview modal
      break;
  }
};

onMounted(async () => {
  // Load root directory on mount
  await fileStore.navigateTo('/');
});
</script>
```

## Upload Components

### Upload Interface Components
```
components/upload/
├── UploadArea.vue            # Drag & drop upload area
├── UploadQueue.vue           # Upload queue with progress
├── ProgressTracker.vue       # Individual upload progress
├── ChunkedUpload.vue         # Large file chunked upload
└── UploadHistory.vue         # Upload history
```

```vue
<!-- components/upload/UploadArea.vue -->
<template>
  <div 
    class="upload-area" 
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="upload-content" @click="triggerFileSelect">
      <i class="upload-icon"></i>
      <p>Drag & drop files here or click to browse</p>
      <p class="upload-subtext">Supports multiple files and large uploads</p>
    </div>
    
    <input
      ref="fileInput"
      type="file"
      multiple
      @change="handleFileSelect"
      style="display: none"
    />
    
    <div v-for="upload in uploadQueue" :key="upload.id" class="upload-progress">
      <ProgressTracker :upload="upload" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useUploadStore } from '@/stores/upload';
import ProgressTracker from './ProgressTracker.vue';

const emit = defineEmits(['files-uploaded', 'close']);
const fileInput = ref(null);
const dragOver = ref(false);
const uploadStore = useUploadStore();

const triggerFileSelect = () => {
  fileInput.value.click();
};

const handleFileSelect = async (event) => {
  const files = Array.from(event.target.files);
  await uploadFiles(files);
};

const handleDragOver = (event) => {
  dragOver.value = true;
  event.preventDefault();
};

const handleDragLeave = () => {
  dragOver.value = false;
};

const handleDrop = async (event) => {
  dragOver.value = false;
  const files = Array.from(event.dataTransfer.files);
  await uploadFiles(files);
};

const uploadFiles = async (files) => {
  for (const file of files) {
    await uploadStore.addFile(file);
  }
  
  // Start upload process
  await uploadStore.startUploads();
  
  // Emit when all uploads complete
  uploadStore.$subscribe((mutation, state) => {
    if (state.allUploadsComplete) {
      emit('files-uploaded');
    }
  });
};
</script>
```

## Administrative Components

### Admin Interface Components
```
components/admin/
├── UserManagement.vue        # User management interface
├── RoleManagement.vue        # Role management interface
├── ACLManagement.vue         # Access control management
├── SystemStatus.vue          # System health monitoring
└── SettingsPanel.vue         # System settings
```

```vue
<!-- components/admin/UserManagement.vue -->
<template>
  <div class="user-management">
    <h2>User Management</h2>
    
    <div class="management-controls">
      <button @click="showCreateUserModal" class="btn-primary">Add User</button>
      <input 
        v-model="searchQuery" 
        placeholder="Search users..." 
        class="search-input"
      />
    </div>
    
    <div class="user-list">
      <div 
        v-for="user in filteredUsers" 
        :key="user.id" 
        class="user-card"
      >
        <UserAvatar :user="user" />
        <div class="user-info">
          <h3>{{ user.username }}</h3>
          <p>{{ user.email }}</p>
          <div class="user-roles">
            <span 
              v-for="role in user.roles" 
              :key="role" 
              class="role-badge"
            >
              {{ role }}
            </span>
          </div>
        </div>
        <div class="user-actions">
          <button @click="editUser(user)" class="btn-secondary">Edit</button>
          <button @click="deleteUser(user.id)" class="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/users';
import UserAvatar from '../common/UserAvatar.vue';

const userStore = useUserStore();
const searchQuery = ref('');

// Computed properties
const allUsers = computed(() => userStore.users);
const filteredUsers = computed(() => {
  if (!searchQuery.value) return allUsers.value;
  
  return allUsers.value.filter(user => 
    user.username.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// Methods
const showCreateUserModal = () => {
  // Show user creation modal
};

const editUser = (user) => {
  // Show user edit modal
};

const deleteUser = async (userId) => {
  if (confirm('Are you sure you want to delete this user?')) {
    await userStore.deleteUser(userId);
  }
};
</script>
```

## State Management Integration

### Pinia Stores Structure
```
stores/
├── auth.js                   # Authentication state
├── files.js                  # File browser state
├── upload.js                 # Upload state
├── users.js                  # User management state
├── ui.js                     # UI state management
└── acl.js                    # Access control state
```

```javascript
// stores/files.js
import { defineStore } from 'pinia';
import { fileService } from '@/services/fileService';

export const useFileStore = defineStore('files', {
  state: () => ({
    currentPath: '/',
    currentDirectoryItems: [],
    loading: false,
    directoryCache: new Map(),
    selectedItems: [],
    viewMode: 'list'
  }),
  
  getters: {
    currentDirectoryUid: (state) => {
      // Convert path to UID based on your path resolution logic
      return this.resolvePathToUid(state.currentPath);
    },
    
    breadcrumbs: (state) => {
      const pathParts = state.currentPath.split('/').filter(p => p);
      const breadcrumbs = [{ name: 'Home', path: '/' }];
      
      let currentPath = '';
      for (const part of pathParts) {
        currentPath += '/' + part;
        breadcrumbs.push({ name: part, path: currentPath });
      }
      
      return breadcrumbs;
    }
  },
  
  actions: {
    async navigateTo(path) {
      this.loading = true;
      try {
        // Check if we have this directory in cache
        if (this.directoryCache.has(path)) {
          this.currentDirectoryItems = this.directoryCache.get(path);
        } else {
          const result = await fileService.listDirectory(this.resolvePathToUid(path));
          if (result.success) {
            this.currentDirectoryItems = result.data;
            this.directoryCache.set(path, result.data);
          }
        }
        this.currentPath = path;
      } catch (error) {
        console.error('Failed to navigate to directory:', error);
      } finally {
        this.loading = false;
      }
    },
    
    async createDirectory(name) {
      this.loading = true;
      try {
        const result = await fileService.createDirectory(
          this.currentDirectoryUid, 
          name
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
      try {
        const isDirectory = this.currentDirectoryItems.find(item => item.id === uid)?.isDirectory;
        const result = isDirectory 
          ? await fileService.removeDirectory(uid)
          : await fileService.removeFile(uid);
        
        if (result.success) {
          // Remove from current directory items
          this.currentDirectoryItems = this.currentDirectoryItems.filter(item => item.id !== uid);
        }
      } catch (error) {
        console.error('Failed to delete item:', error);
      }
    },
    
    resolvePathToUid(path) {
      // Implement path to UID resolution based on your system
      // This is a placeholder implementation
      return path === '/' ? 'root-uid' : `uid-for-${path}`;
    },
    
    refreshCurrentDirectory() {
      // Remove from cache to force reload
      this.directoryCache.delete(this.currentPath);
      return this.navigateTo(this.currentPath);
    }
  }
});
```

## Composable Functions

### Vue Composables Structure
```
composables/
├── useAuth.js                # Authentication composable
├── useFileOperations.js      # File operation composable
├── useUpload.js              # Upload management composable
├── useACL.js                 # Access control composable
└── useUI.js                  # UI state composable
```

```javascript
// composables/useFileOperations.js
import { ref } from 'vue';
import { fileService } from '@/services/fileService';

export const useFileOperations = () => {
  const loading = ref(false);
  const error = ref(null);

  const createDirectory = async (parentUid, name) => {
    loading.value = true;
    error.value = null;
    
    try {
      const result = await fileService.createDirectory(parentUid, name);
      if (!result.success) {
        error.value = result.error;
        return null;
      }
      return result.data;
    } catch (err) {
      error.value = err.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  const deleteItem = async (uid, isDirectory = false) => {
    loading.value = true;
    error.value = null;
    
    try {
      const result = isDirectory
        ? await fileService.removeDirectory(uid)
        : await fileService.removeFile(uid);
      
      if (!result.success) {
        error.value = result.error;
        return false;
      }
      return true;
    } catch (err) {
      error.value = err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  const getFileMetadata = async (uid) => {
    loading.value = true;
    error.value = null;
    
    try {
      const result = await fileService.getFileMetadata(uid);
      if (!result.success) {
        error.value = result.error;
        return null;
      }
      return result.data;
    } catch (err) {
      error.value = err.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    createDirectory,
    deleteItem,
    getFileMetadata
  };
};
```

## Routing Structure

### Vue Router Configuration
```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// Route-level components
import LoginView from '@/views/LoginView.vue';
import DashboardView from '@/views/DashboardView.vue';
import FileBrowserView from '@/views/FileBrowserView.vue';
import AdminView from '@/views/AdminView.vue';
import ProfileView from '@/views/ProfileView.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/files',
    name: 'FileBrowser',
    component: FileBrowserView,
    meta: { requiresAuth: true, accessLevel: 'user' }
  },
  {
    path: '/files/:pathMatch(.*)*',
    name: 'FileBrowserPath',
    component: FileBrowserView,
    meta: { requiresAuth: true, accessLevel: 'user' },
    props: true
  },
  {
    path: '/admin',
    name: 'Admin',
    component: AdminView,
    meta: { requiresAuth: true, accessLevel: 'admin' }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: ProfileView,
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
});

// Navigation guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login');
  } else if (to.meta.accessLevel && !authStore.hasAccessLevel(to.meta.accessLevel)) {
    next('/'); // Redirect to home if insufficient access level
  } else {
    next();
  }
});

export default router;
```

This component architecture provides a solid foundation for the FileEngine frontend, with modular, reusable components that properly integrate with the Pinia state management system and the FileEngine API.