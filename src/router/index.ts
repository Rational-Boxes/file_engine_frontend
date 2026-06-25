import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/utils/redirect'

const LoginView = () => import('@/views/LoginView.vue')
const OAuthCallbackView = () => import('@/views/OAuthCallbackView.vue')
const FileBrowserView = () => import('@/views/FileBrowserView.vue')
const SearchView = () => import('@/views/SearchView.vue')
const ChatView = () => import('@/views/ChatView.vue')
const AdminRolesView = () => import('@/views/AdminRolesView.vue')
const AdminOpsView = () => import('@/views/AdminOpsView.vue')
const PreviewView = () => import('@/views/PreviewView.vue')

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
  { path: '/oauth/callback', name: 'OAuthCallback', component: OAuthCallbackView, meta: { requiresAuth: false } },
  { path: '/files', name: 'FileBrowser', component: FileBrowserView, meta: { requiresAuth: true } },
  { path: '/search', name: 'Search', component: SearchView, meta: { requiresAuth: true } },
  { path: '/chat', name: 'Chat', component: ChatView, meta: { requiresAuth: true } },
  { path: '/preview/:uid', name: 'Preview', component: PreviewView, meta: { requiresAuth: true } },
  {
    path: '/admin/roles',
    name: 'AdminRoles',
    component: AdminRolesView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/ops',
    name: 'AdminOps',
    component: AdminOpsView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  { path: '/', redirect: '/files' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // Remember where they were headed (e.g. a shared deep link) so login can
    // return them there afterwards.
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.hasAccessLevel('admin')) {
    return { path: '/files' }
  }
  if (to.path === '/login' && auth.isAuthenticated) {
    return { path: safeRedirect(to.query.redirect) }
  }
})

export default router
