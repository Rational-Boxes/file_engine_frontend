<!--
  Copyright (C) 2026 James Hickman

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!-- Its own page rather than a System tab: extraction editors are not
     necessarily administrators, and the System page is admin-only. -->
<template>
  <div class="prompt-sets-view">
    <AppNav />
    <main class="content">
      <h1 class="title">Extraction prompt sets</h1>
      <PromptSetsPanel />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
import PromptSetsPanel from '@/components/system/PromptSetsPanel.vue'
</script>

<style scoped>
.content { max-width: 1180px; margin: 0 auto; padding: 20px 18px; }
.title { font-size: 20px; margin: 0 0 12px; }
</style>
