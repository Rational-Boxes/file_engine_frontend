import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Route-level components
const LoginView = () => import('@/views/LoginView.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const FileBrowserView = () => import('@/views/FileBrowserView.vue')
const AdminView = () => import('@/views/AdminView.vue')
const ProfileView = () => import('@/views/ProfileView.vue')

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
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Navigation guard with access control
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.meta.accessLevel && !authStore.hasAccessLevel(to.meta.accessLevel)) {
    next('/') // Redirect to home if insufficient access level
  } else {
    next()
  }
})

export default router