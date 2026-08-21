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

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { authService } from '@/services/authService'
import { setLoginLabel } from '@/utils/tenantHost'

const app = createApp(App)

app.use(createPinia())

// Learn the deployment's shape BEFORE the router runs.
//
// The router's guard sends a signed-out visitor on a tenant origin to the
// shared sign-in host, and it needs that host's label to do so. The label is a
// run-time fact (one image, many deployments), so it has to be fetched — and
// fetched before the first navigation, or the very first guarded route would
// redirect to the wrong host.
//
// siteConfig never throws: an unreachable bridge yields the defaults, so the
// app always mounts and always shows a password form.
authService.siteConfig()
  .then((cfg) => setLoginLabel(cfg.loginSubdomain))
  .finally(() => {
    app.use(router)
    app.mount('#app')
  })