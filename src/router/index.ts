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
import { activeTenantFromHost, isLoginOrigin, loginUrl } from '@/utils/tenantHost'
import { safeRedirect } from '@/utils/redirect'

const LoginView = () => import('@/views/LoginView.vue')
const OAuthCallbackView = () => import('@/views/OAuthCallbackView.vue')
const SsoLandingView = () => import('@/views/SsoLandingView.vue')
const ShareLandingView = () => import('@/views/ShareLandingView.vue')
const AdminSharesView = () => import('@/views/AdminSharesView.vue')
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
const SecurityView = () => import('@/views/SecurityView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const SetPasswordView = () => import('@/views/SetPasswordView.vue')
const ResetPasswordView = () => import('@/views/ResetPasswordView.vue')

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
  { path: '/oauth/callback', name: 'OAuthCallback', component: OAuthCallbackView, meta: { requiresAuth: false } },
  // Deep-link SSO landing (§5.5): redeems a one-time hand-off code from another system.
  { path: '/sso', name: 'SsoLanding', component: SsoLandingView, meta: { requiresAuth: false } },
  // The recipient's side of an outside share link. requiresAuth:false is not a
  // convenience here — this page must work for someone with no account, and it
  // must not pick up a signed-in identity if one happens to be present.
  { path: '/s/:token', name: 'ShareLanding', component: ShareLandingView,
    meta: { requiresAuth: false } },
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
    // The tenant-wide share oversight console. requiresAdmin gates the ROUTE;
    // share_service gates the data independently and 403s a non-admin, so a
    // hand-typed URL gets an error rather than an empty table that would read
    // as "nothing is shared here".
    path: '/admin/shares',
    name: 'AdminShares',
    component: AdminSharesView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/security',
    name: 'Security',
    component: SecurityView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  { path: '/profile', name: 'Profile', component: ProfileView, meta: { requiresAuth: true } },
  // `/invite` and `/reset` are ALIASES, not the canonical paths, because that is
  // what the deployment actually mails out: ldap_manager builds its links from
  // INVITE_LINK_BASE / RESET_LINK_BASE, and the Ansible defaults end them in
  // `/invite` and `/reset`. Neither had a route, so every invitation and every
  // password reset landed on an empty <div id="app">.
  //
  // Aliased rather than renamed, and rather than repointing the config, so that
  // links already sitting in people's inboxes start working too. Both views read
  // their token from the query string, so the path they arrive on is immaterial.
  {
    path: '/set-password', name: 'SetPassword', component: SetPasswordView,
    alias: '/invite', meta: { requiresAuth: false },
  },
  {
    path: '/reset-password', name: 'ResetPassword', component: ResetPasswordView,
    alias: '/reset', meta: { requiresAuth: false },
  },
  { path: '/', redirect: '/dashboard' },
  // LAST, and the reason the two bugs above were invisible: with no catch-all a
  // Vue router matches nothing and renders nothing, so a wrong URL is a blank
  // page that reports no error anywhere — not in the console, not in the network
  // tab (the SPA shell is a healthy 200), not in the nginx log. Public, because
  // bouncing an unknown path to the login form tells a signed-out visitor the
  // wrong story about what went wrong.
  {
    path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundView,
    meta: { requiresAuth: false },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // On a TENANT origin, signing in happens at the shared login host — one
    // origin to style, and one entry in OAUTH_RETURN_ALLOWLIST however many
    // tenants exist. The intended destination travels as a path (never a full
    // URL, which would make this an open redirect) and the tenant travels
    // separately, so the return target is reconstructed rather than trusted.
    const tenant = activeTenantFromHost()
    if (tenant && !isLoginOrigin()) {
      const url = loginUrl(to.fullPath, tenant)
      if (url) {
        window.location.href = url
        return false   // hand over to the browser; cancel the in-app navigation
      }
    }
    // No subdomain tenancy (bare localhost, an IP) — the local form is the
    // only way in, so keep the existing behaviour.
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
