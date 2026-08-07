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

// Shared reactive state for folder_actions metadata that more than one surface
// consumes. Notify templates are edited under System > Email templates but also
// offered in the notify binding editor's template dropdown — this store is the
// single source so adding/removing a template updates the dropdown live, with no
// full-interface reload.

import { defineStore } from 'pinia'
import { folderActionsService } from '@/services/folderActionsService'
import type { NotifyTemplateSummary } from '@/types/folderActions'

interface State {
  notifyTemplates: NotifyTemplateSummary[]
  notifyLoaded: boolean
}

export const useFolderActionsStore = defineStore('folderActions', {
  state: (): State => ({
    notifyTemplates: [],
    notifyLoaded: false,
  }),
  actions: {
    // Force-refresh from the API (call after any create/update/delete).
    async refreshNotifyTemplates(): Promise<void> {
      this.notifyTemplates = await folderActionsService.listNotifyTemplates()
      this.notifyLoaded = true
    },
    // Load once if not already loaded; non-fatal on error (leaves the list empty).
    async ensureNotifyTemplates(): Promise<void> {
      if (this.notifyLoaded) return
      try {
        await this.refreshNotifyTemplates()
      } catch {
        this.notifyTemplates = []
      }
    },
  },
})

export default useFolderActionsStore
