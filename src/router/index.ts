import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const LoginView = () => import('@/views/LoginView.vue')
const OAuthCallbackView = () => import('@/views/OAuthCallbackView.vue')
const FileBrowserView = () => import('@/views/FileBrowserView.vue')

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
  { path: '/oauth/callback', name: 'OAuthCallback', component: OAuthCallbackView, meta: { requiresAuth: false } },
  { path: '/files', name: 'FileBrowser', component: FileBrowserView, meta: { requiresAuth: true } },
  { path: '/', redirect: '/files' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login' }
  }
  if (to.path === '/login' && auth.isAuthenticated) {
    return { path: '/files' }
  }
})

export default router
