<template>
  <div class="oauth-consent">
    <div class="card">
      <div v-if="phase === 'loading'" class="center">
        <p class="muted">Preparing…</p>
      </div>

      <div v-else-if="phase === 'error'" class="center">
        <h1>Authorization error</h1>
        <p class="err">{{ error }}</p>
        <router-link class="link" to="/dashboard">Return to FileEngine</router-link>
      </div>

      <div v-else-if="phase === 'consent'">
        <h1>Authorize access</h1>
        <p class="lead">
          <strong>{{ clientName }}</strong> wants to access your FileEngine account.
        </p>
        <p class="who">Signed in as <strong>{{ auth.user }}</strong> · {{ auth.tenant }}</p>

        <ul class="scopes">
          <li v-for="s in scopes" :key="s">
            <span class="tick">✓</span> {{ scopeLabel(s) }}
          </li>
        </ul>

        <label class="remember">
          <input type="checkbox" v-model="remember" />
          Don’t ask again for this application
        </label>

        <p v-if="decideError" class="err">{{ decideError }}</p>
        <div class="actions">
          <button class="btn ghost" :disabled="busy" @click="decide(false)">Deny</button>
          <button class="btn" :disabled="busy" @click="decide(true)">Allow</button>
        </div>
        <p class="fine">You can revoke this access later in your account settings.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'
import {
  oauthService,
  authorizeParamsFromQuery,
  scopeLabel,
  type AuthorizeParams,
} from '@/services/oauthService'

const route = useRoute()
const auth = useAuthStore()

const phase = ref<'loading' | 'consent' | 'error'>('loading')
const error = ref('')
const decideError = ref('')
const clientName = ref('')
const scopes = ref<string[]>([])
const remember = ref(false)
const busy = ref(false)

// Rebuild the OAuth params from the query (the route guard has already ensured the
// user is authenticated, returning them here after login if needed).
const params: AuthorizeParams = authorizeParamsFromQuery(
  new URLSearchParams(route.fullPath.split('?')[1] || ''),
)

// Hand the browser back to the client (or an error redirect). A full navigation —
// we are leaving the SPA for the relying party's callback.
function leave(url: string) {
  window.location.href = url
}

async function decide(approved: boolean) {
  busy.value = true
  decideError.value = ''
  try {
    const r = await oauthService.decide(params, approved, remember.value)
    leave(r.url)
  } catch (e) {
    decideError.value = errorMessage(e)
    busy.value = false
  }
}

onMounted(async () => {
  if (!params.client_id || !params.redirect_uri) {
    phase.value = 'error'
    error.value = 'This authorization link is missing required parameters.'
    return
  }
  try {
    const r = await oauthService.prepare(params)
    if (r.action === 'redirect' || r.action === 'error') {
      leave(r.url) // trusted / already-consented, or a redirectable protocol error
      return
    }
    clientName.value = r.client_name
    scopes.value = r.scopes
    phase.value = 'consent'
  } catch (e) {
    phase.value = 'error'
    error.value = errorMessage(e)
  }
})

defineExpose({ scopeLabel })
</script>

<style scoped>
.oauth-consent {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 20px;
}
.card {
  width: min(440px, 94vw);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
}
.center {
  text-align: center;
}
h1 {
  font-size: 1.25rem;
  margin: 0 0 12px;
}
.lead {
  margin: 0 0 4px;
}
.who {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0 0 16px;
}
.scopes {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scopes li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.9rem;
}
.tick {
  color: var(--primary);
  font-weight: 700;
}
.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 16px;
}
.actions {
  display: flex;
  gap: 12px;
}
.btn {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn.ghost {
  background: transparent;
  color: var(--fg);
  border-color: var(--border);
}
.btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.fine {
  color: var(--muted);
  font-size: 0.75rem;
  margin: 14px 0 0;
  text-align: center;
}
.err {
  color: var(--danger);
  font-size: 0.85rem;
}
.link {
  color: var(--primary);
}
</style>
