// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/utils/redirect'

const LoginView = () => import('@/views/LoginView.vue')
const OAuthCallbackView = () => import('@/views/OAuthCallbackView.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const FileBrowserView = () => import('@/views/FileBrowserView.vue')
const SearchView = () => import('@/views/SearchView.vue')
const ChatView = () => import('@/views/ChatView.vue')
const AdminOpsView = () => import('@/views/AdminOpsView.vue')
const PreviewView = () => import('@/views/PreviewView.vue')
const OnlyOfficeEditorView = () => import('@/views/OnlyOfficeEditorView.vue')
const OAuthConsentView = () => import('@/views/OAuthConsentView.vue')
const ProfileView = () => import('@/views/ProfileView.vue')
const TenantAdminView = () => import('@/views/TenantAdminView.vue')
const McpIntegrationsView = () => import('@/views/McpIntegrationsView.vue')
const ClassifierSetsView = () => import('@/views/ClassifierSetsView.vue')
const SetPasswordView = () => import('@/views/SetPasswordView.vue')
const ResetPasswordView = () => import('@/views/ResetPasswordView.vue')

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
  { path: '/oauth/callback', name: 'OAuthCallback', component: OAuthCallbackView, meta: { requiresAuth: false } },
  { path: '/dashboard', name: 'Dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/files', name: 'FileBrowser', component: FileBrowserView, meta: { requiresAuth: true } },
  { path: '/search', name: 'Search', component: SearchView, meta: { requiresAuth: true } },
  { path: '/chat', name: 'Chat', component: ChatView, meta: { requiresAuth: true } },
  { path: '/preview/:uid', name: 'Preview', component: PreviewView, meta: { requiresAuth: true } },
  { path: '/edit/:uid', name: 'Edit', component: OnlyOfficeEditorView, meta: { requiresAuth: true } },
  // OAuth authorization/consent — an external client redirects the browser here; the
  // auth guard bounces to /login (and back) if not signed in, then consent is shown.
  { path: '/oauth/authorize', name: 'OAuthConsent', component: OAuthConsentView, meta: { requiresAuth: true } },
  {
    path: '/admin/ops',
    name: 'AdminOps',
    component: AdminOpsView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/tenant',
    name: 'TenantAdmin',
    component: TenantAdminView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/integrations',
    name: 'McpIntegrations',
    component: McpIntegrationsView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/classifiers',
    name: 'ClassifierSets',
    component: ClassifierSetsView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  { path: '/profile', name: 'Profile', component: ProfileView, meta: { requiresAuth: true } },
  { path: '/set-password', name: 'SetPassword', component: SetPasswordView, meta: { requiresAuth: false } },
  { path: '/reset-password', name: 'ResetPassword', component: ResetPasswordView, meta: { requiresAuth: false } },
  { path: '/', redirect: '/dashboard' },
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
