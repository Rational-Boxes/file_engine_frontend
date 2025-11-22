# FileEngine Frontend - Access Level Management and Menu Systems Plan

## Overview

This document outlines the comprehensive plan for implementing access level management and dynamic menu systems in the FileEngine frontend. The system will support multiple user access levels (user, editor, admin) with role-based permissions that dynamically affect UI visibility and functionality.

## Access Level Architecture

### Access Level Hierarchy

The FileEngine frontend supports three primary access levels:

1. **User (Basic)**: Standard file operations (read, write, basic management)
2. **Editor**: Extended file operations (advanced management, sharing, metadata)
3. **Admin**: Full system access (user management, system configuration, ACL management)

### Role-to-Access Level Mapping

```javascript
// Role-to-Level mapping
const roleToAccessLevel = {
  'guest': 'user',        // Read-only in designated areas
  'user': 'user',         // Standard user operations
  'editor': 'editor',     // Enhanced editing capabilities  
  'admin': 'admin',       // Full administrative access
  'root': 'admin'         // System-level access
};
```

### Permission-Based Access Control

Access to features is determined by permissions granted to roles:

```javascript
// Permission structure
const permissions = {
  'file.read': 'Read files and directories',
  'file.write': 'Create and modify files',
  'file.delete': 'Delete files',
  'directory.create': 'Create directories',
  'directory.delete': 'Delete directories',
  'acl.manage': 'Manage access control',
  'user.manage': 'Manage users and roles',
  'system.config': 'System configuration',
  'version.manage': 'Manage file versions'
};
```

## Dynamic Menu System

### Menu Structure Definition

```javascript
// src/config/menuConfig.js
export const menuConfig = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard-icon',
    route: '/',
    requiredLevel: 'user',
    permissions: ['file.read'],
    children: []
  },
  {
    id: 'files',
    label: 'Files',
    icon: 'files-icon',
    route: '/files',
    requiredLevel: 'user',
    permissions: ['file.read'],
    children: [
      {
        id: 'browse',
        label: 'Browse Files',
        route: '/files',
        requiredLevel: 'user',
        permissions: ['file.read']
      },
      {
        id: 'search',
        label: 'Search',
        route: '/files/search',
        requiredLevel: 'user',
        permissions: ['file.read']
      }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: 'admin-icon',
    requiredLevel: 'admin',
    permissions: ['user.manage', 'system.config'],
    children: [
      {
        id: 'users',
        label: 'User Management',
        route: '/admin/users',
        requiredLevel: 'admin',
        permissions: ['user.manage']
      },
      {
        id: 'acl',
        label: 'Access Control',
        route: '/admin/acl',
        requiredLevel: 'admin',
        permissions: ['acl.manage']
      },
      {
        id: 'system',
        label: 'System Settings',
        route: '/admin/system',
        requiredLevel: 'admin',
        permissions: ['system.config']
      }
    ]
  }
];
```

### Menu Component Implementation

```vue
<!-- components/common/Sidebar.vue -->
<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>FileEngine</h2>
    </div>
    
    <nav class="sidebar-nav">
      <SidebarMenuItem
        v-for="item in filteredMenuItems"
        :key="item.id"
        :item="item"
        :current-route="currentRoute"
      />
    </nav>
    
    <div class="sidebar-footer">
      <UserMenu :user="user" :access-level="accessLevel" />
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import SidebarMenuItem from './SidebarMenuItem.vue';
import UserMenu from './UserMenu.vue';
import { menuConfig } from '@/config/menuConfig';

const route = useRoute();
const authStore = useAuthStore();

const currentRoute = computed(() => route.path);
const user = computed(() => authStore.user);
const accessLevel = computed(() => authStore.accessLevel);
const userPermissions = computed(() => authStore.userRoles);

// Filter menu items based on user's access level
const filteredMenuItems = computed(() => {
  return menuConfig.filter(item => 
    hasAccessToMenu(item)
  );
});

const hasAccessToMenu = (item) => {
  // Check access level
  if (!hasRequiredAccessLevel(item.requiredLevel)) {
    return false;
  }
  
  // Check permissions if specified
  if (item.permissions && item.permissions.length > 0) {
    return item.permissions.some(permission => 
      hasPermission(permission)
    );
  }
  
  return true;
};

const hasRequiredAccessLevel = (requiredLevel) => {
  if (!requiredLevel) return true; // No level required
  
  const levels = {
    'user': 1,
    'editor': 2,
    'admin': 3
  };
  
  const userLevel = levels[accessLevel.value] || 1;
  const requiredLevelNum = levels[requiredLevel] || 1;
  
  return userLevel >= requiredLevelNum;
};

const hasPermission = (permission) => {
  // Check if user has required permission
  // This could be based on roles or specific permissions
  return userPermissions.value.includes(permission) || 
         userPermissions.value.includes('admin'); // Admin has all permissions
};
</script>
```

```vue
<!-- components/common/SidebarMenuItem.vue -->
<template>
  <div class="sidebar-menu-item">
    <router-link 
      v-if="item.route && !item.children?.length"
      :to="item.route"
      class="menu-link"
      :class="{ active: isActive }"
    >
      <i :class="item.icon"></i>
      <span>{{ item.label }}</span>
    </router-link>
    
    <div v-else class="menu-group">
      <div 
        class="menu-header"
        :class="{ active: isGroupActive }"
        @click="toggleGroup"
      >
        <i :class="item.icon"></i>
        <span>{{ item.label }}</span>
        <i 
          class="chevron-icon"
          :class="{ expanded: isOpen }"
        ></i>
      </div>
      
      <div 
        v-show="isOpen"
        class="submenu"
      >
        <SidebarMenuItem
          v-for="child in filteredChildren"
          :key="child.id"
          :item="child"
          :current-route="currentRoute"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  currentRoute: {
    type: String,
    required: true
  }
});

const authStore = useAuthStore();
const isOpen = ref(false);

// Computed properties
const isActive = computed(() => 
  props.currentRoute === props.item.route
);

const isGroupActive = computed(() => 
  props.item.children?.some(child => 
    props.currentRoute.startsWith(child.route)
  )
);

const filteredChildren = computed(() => {
  return props.item.children?.filter(child => 
    hasAccessToMenu(child)
  ) || [];
});

// Methods
const toggleGroup = () => {
  if (props.item.children && props.item.children.length > 0) {
    isOpen.value = !isOpen.value;
  }
};

const hasAccessToMenu = (item) => {
  // Check access level
  const levels = {
    'user': 1,
    'editor': 2,
    'admin': 3
  };
  
  const userLevel = levels[authStore.accessLevel] || 1;
  const requiredLevel = levels[item.requiredLevel] || 1;
  
  if (userLevel < requiredLevel) {
    return false;
  }
  
  // Check permissions if specified
  if (item.permissions && item.permissions.length > 0) {
    return item.permissions.some(permission => 
      authStore.userRoles.includes(permission) || 
      authStore.userRoles.includes('admin')
    );
  }
  
  return true;
};
</script>
```

## Access Level Management Components

### Access Level Switcher Component

```vue
<!-- components/common/AccessLevelSwitcher.vue -->
<template>
  <div class="access-level-switcher">
    <label for="access-level">Access Level:</label>
    <select 
      id="access-level"
      v-model="currentLevel"
      @change="changeAccessLevel"
      class="access-level-select"
    >
      <option 
        v-for="level in availableLevels" 
        :key="level.value"
        :value="level.value"
        :disabled="!level.enabled"
      >
        {{ level.label }} {{ level.enabled ? '' : ' (Current)' }}
      </option>
    </select>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const currentLevel = ref(authStore.accessLevel);

// Determine available levels based on user's roles
const availableLevels = computed(() => {
  if (!authStore.user) return [];
  
  const allLevels = [
    { value: 'user', label: 'Standard User', enabled: true },
    { value: 'editor', label: 'Editor', enabled: hasRole('editor') },
    { value: 'admin', label: 'Administrator', enabled: hasRole('admin') }
  ];
  
  return allLevels.map(level => ({
    ...level,
    enabled: level.value === authStore.accessLevel ? false : level.enabled
  }));
});

const hasRole = (role) => {
  return authStore.user?.roles?.includes(role) || false;
};

const changeAccessLevel = () => {
  if (currentLevel.value !== authStore.accessLevel) {
    authStore.setAccessLevel(currentLevel.value);
    // Reload UI to reflect new access level
    location.reload(); // Or more gracefully update the UI
  }
};

// Watch for changes in access level from store
watch(() => authStore.accessLevel, (newLevel) => {
  currentLevel.value = newLevel;
});
</script>
```

### Permission-Based Component Directives

```javascript
// src/directives/hasPermission.js
import { useAuthStore } from '@/stores/auth';

export const hasPermission = {
  mounted(el, binding) {
    const authStore = useAuthStore();
    const { value: requiredPermissions } = binding;
    
    if (!hasRequiredPermission(authStore, requiredPermissions)) {
      el.style.display = 'none';
    }
  },
  updated(el, binding) {
    const authStore = useAuthStore();
    const { value: requiredPermissions } = binding;
    
    if (hasRequiredPermission(authStore, requiredPermissions)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
};

const hasRequiredPermission = (authStore, requiredPermissions) => {
  if (!requiredPermissions) return true;
  
  const permissions = Array.isArray(requiredPermissions) 
    ? requiredPermissions 
    : [requiredPermissions];
  
  return permissions.some(permission => 
    authStore.userRoles.includes(permission) || 
    authStore.userRoles.includes('admin')
  );
};
```

### Access Control Store

```javascript
// stores/accessControl.js
import { defineStore } from 'pinia';
import { useAuthStore } from './auth';

export const useAccessControlStore = defineStore('accessControl', {
  state: () => ({
    permissions: [],
    roles: [],
    userPermissions: new Map(),
    permissionHierarchy: {
      'admin': ['user', 'editor', 'admin'],
      'editor': ['user', 'editor'],
      'user': ['user']
    }
  }),
  
  getters: {
    hasPermission: (state) => (permission) => {
      const authStore = useAuthStore();
      return state.userPermissions.has(authStore.user?.id) 
        ? state.userPermissions.get(authStore.user.id).includes(permission)
        : false;
    },
    
    canAccessRoute: (state) => (route) => {
      const requiredPermission = route.meta?.permission;
      if (!requiredPermission) return true;
      
      return state.hasPermission(requiredPermission);
    },
    
    getUserAccessLevel: (state) => {
      const authStore = useAuthStore();
      const userRoles = authStore.user?.roles || [];
      
      if (userRoles.includes('admin')) return 'admin';
      if (userRoles.includes('editor')) return 'editor';
      return 'user';
    }
  },
  
  actions: {
    async loadUserPermissions(userId) {
      // Load user permissions from backend
      // This would typically make an API call to get user's permissions
      try {
        // const response = await apiClient.get(`/auth/user/${userId}/permissions`);
        // const permissions = response.data.permissions;
        
        // For now, use mock data based on roles
        const authStore = useAuthStore();
        const userRoles = authStore.user?.roles || [];
        const permissions = this.derivePermissionsFromRoles(userRoles);
        
        this.userPermissions.set(userId, permissions);
      } catch (error) {
        console.error('Failed to load user permissions:', error);
      }
    },
    
    derivePermissionsFromRoles(roles) {
      // Define role-to-permission mappings
      const rolePermissions = {
        'user': [
          'file.read', 
          'file.write', 
          'file.delete', 
          'directory.create',
          'file.metadata.read'
        ],
        'editor': [
          'file.read', 
          'file.write', 
          'file.delete', 
          'directory.create', 
          'file.metadata.read',
          'file.metadata.write',
          'version.manage'
        ],
        'admin': [
          'file.read', 
          'file.write', 
          'file.delete', 
          'directory.create', 
          'directory.delete',
          'file.metadata.read',
          'file.metadata.write',
          'version.manage',
          'acl.manage',
          'user.manage',
          'system.config'
        ]
      };
      
      const permissions = new Set();
      
      // Add permissions based on roles
      roles.forEach(role => {
        if (rolePermissions[role]) {
          rolePermissions[role].forEach(permission => {
            permissions.add(permission);
          });
        }
      });
      
      return Array.from(permissions);
    },
    
    hasRole(userId, role) {
      const authStore = useAuthStore();
      return authStore.user?.roles?.includes(role) || false;
    }
  }
});
```

## Role-Based UI Components

### Permission-Based UI Elements

```vue
<!-- components/common/PermissionWrapper.vue -->
<template>
  <div v-if="hasRequiredPermission" v-bind="$attrs">
    <slot />
  </div>
  <div v-else-if="showPlaceholder" class="permission-placeholder">
    <i class="permission-icon"></i>
    <p>{{ placeholderMessage }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAccessControlStore } from '@/stores/accessControl';

const props = defineProps({
  permission: {
    type: [String, Array],
    required: true
  },
  showPlaceholder: {
    type: Boolean,
    default: false
  },
  placeholderMessage: {
    type: String,
    default: 'Insufficient permissions to view this content'
  }
});

const accessControl = useAccessControlStore();

const hasRequiredPermission = computed(() => {
  if (Array.isArray(props.permission)) {
    return props.permission.some(perm => 
      accessControl.hasPermission(perm)
    );
  }
  return accessControl.hasPermission(props.permission);
});
</script>
```

### Role-Based Content Component

```vue
<!-- components/common/RoleBasedContent.vue -->
<template>
  <div v-if="canViewContent" v-bind="$attrs">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  roles: {
    type: Array,
    default: () => []
  },
  permissions: {
    type: Array,
    default: () => []
  },
  requireAll: {
    type: Boolean,
    default: false
  }
});

const authStore = useAuthStore();

const canViewContent = computed(() => {
  // Check roles first
  if (props.roles.length > 0) {
    const hasRequiredRole = props.roles.some(role => 
      authStore.user?.roles?.includes(role)
    );
    
    if (props.requireAll) {
      // For requireAll, all roles must be present
      const hasAllRoles = props.roles.every(role => 
        authStore.user?.roles?.includes(role)
      );
      if (!hasAllRoles) return false;
    } else if (!hasRequiredRole) {
      return false;
    }
  }
  
  // Check permissions
  if (props.permissions.length > 0) {
    if (props.requireAll) {
      // All permissions must be present
      return props.permissions.every(perm => 
        authStore.userRoles.includes(perm) || authStore.userRoles.includes('admin')
      );
    } else {
      // At least one permission must be present
      return props.permissions.some(perm => 
        authStore.userRoles.includes(perm) || authStore.userRoles.includes('admin')
      );
    }
  }
  
  return true;
});
</script>
```

## Route Protection Implementation

### Enhanced Router with Access Control

```javascript
// router/index.js (Enhanced)
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAccessControlStore } from '@/stores/accessControl';

// Import route-level components
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
    meta: { 
      requiresAuth: true,
      requiredLevel: 'user',
      permission: 'file.read'
    }
  },
  {
    path: '/files',
    name: 'FileBrowser',
    component: FileBrowserView,
    meta: { 
      requiresAuth: true, 
      requiredLevel: 'user',
      permission: 'file.read'
    }
  },
  {
    path: '/files/:pathMatch(.*)*',
    name: 'FileBrowserPath',
    component: FileBrowserView,
    meta: { 
      requiresAuth: true, 
      requiredLevel: 'user',
      permission: 'file.read'
    },
    props: true
  },
  {
    path: '/admin',
    name: 'Admin',
    component: AdminView,
    meta: { 
      requiresAuth: true, 
      requiredLevel: 'admin',
      permission: 'user.manage'
    }
  },
  {
    path: '/admin/users',
    name: 'UserManagement',
    component: () => import('@/views/admin/UserManagementView.vue'),
    meta: { 
      requiresAuth: true, 
      requiredLevel: 'admin',
      permission: 'user.manage'
    }
  },
  {
    path: '/admin/acl',
    name: 'ACLManagement',
    component: () => import('@/views/admin/ACLManagementView.vue'),
    meta: { 
      requiresAuth: true, 
      requiredLevel: 'admin',
      permission: 'acl.manage'
    }
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

// Navigation guard with access control
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const accessControlStore = useAccessControlStore();
  
  // Check authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login');
    return;
  }
  
  // Check access level
  if (to.meta.requiredLevel) {
    const levels = {
      'user': 1,
      'editor': 2,
      'admin': 3
    };
    
    const userLevel = levels[authStore.accessLevel] || 1;
    const requiredLevel = levels[to.meta.requiredLevel] || 1;
    
    if (userLevel < requiredLevel) {
      next('/'); // Redirect to home if insufficient access level
      return;
    }
  }
  
  // Check specific permissions
  if (to.meta.permission) {
    // Load permissions if not already loaded
    if (authStore.user && !accessControlStore.userPermissions.has(authStore.user.id)) {
      await accessControlStore.loadUserPermissions(authStore.user.id);
    }
    
    if (!accessControlStore.hasPermission(to.meta.permission)) {
      next('/'); // Redirect if no permission
      return;
    }
  }
  
  next();
});

export default router;
```

## Implementation Strategies

### 1. Lazy Loading with Access Checks

```javascript
// Lazy-load components with access checks
const lazyLoadWithAccessCheck = (importFunc, requiredPermission) => {
  return async () => {
    const accessControlStore = useAccessControlStore();
    
    if (requiredPermission && !accessControlStore.hasPermission(requiredPermission)) {
      throw new Error('Access denied');
    }
    
    return await importFunc();
  };
};

// Example usage in routes:
{
  path: '/admin/users',
  name: 'UserManagement',
  component: lazyLoadWithAccessCheck(
    () => import('@/views/admin/UserManagementView.vue'),
    'user.manage'
  ),
  meta: { 
    requiresAuth: true, 
    requiredLevel: 'admin',
    permission: 'user.manage'
  }
}
```

### 2. Real-time Permission Updates

```javascript
// Real-time permission updates with WebSocket (if implemented)
// stores/accessControl.js (Enhanced)
export const useAccessControlStore = defineStore('accessControl', {
  // ... existing code ...
  
  actions: {
    // ... existing actions ...
    
    async initRealTimeUpdates() {
      // If WebSocket is available, listen for permission updates
      if (window.WebSocket) {
        this.wsConnection = new WebSocket(process.env.VUE_APP_WS_URL);
        
        this.wsConnection.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.type === 'permission_update') {
            this.userPermissions.set(data.userId, data.permissions);
          }
        };
      }
    }
  }
});
```

This comprehensive access level management and menu system ensures that users only see and can access features appropriate to their permission level, providing a secure and appropriate user experience based on their role within the FileEngine system.