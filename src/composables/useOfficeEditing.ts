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

// May this file be opened in the ONLYOFFICE editor, by THIS user?
//
// The extension alone is not the question, and treating it as one is what put an
// always-enabled "Edit in browser" button in front of everybody. The editor
// config endpoint refuses without WRITE on the file —
//
//   403 you do not have permission to edit this file
//
// — so on anything a user can read but not write, the button was offered and the
// editor answered with an access error. Offering an action and then refusing it
// is worse than not offering it: the user cannot tell whether they did something
// wrong, whether the file is broken, or whether the feature is.
//
// Every call site asked the same half-question in its own words (the drawer, the
// preview page, and now the review overlay), so the whole question lives here
// once instead.

import { ref, watch, type Ref } from 'vue'
import { isEditableOffice } from '@/utils/office'
import { fileService } from '@/services/fileService'

export function useOfficeEditing(uid: Ref<string>, name: Ref<string>) {
  const canEdit = ref(false)
  // True while the permission answer is outstanding. Call sites disable the
  // control rather than hiding it, so it does not flicker into existence a
  // moment after the panel opens.
  const checking = ref(false)

  watch(
    [uid, name],
    async ([u, n]) => {
      canEdit.value = false
      // The cheap half first: no request for a .zip.
      if (!u || !isEditableOffice(n)) return
      checking.value = true
      try {
        canEdit.value = await fileService.checkPermission(u, { permission: 'w' })
      } catch {
        // FAIL CLOSED. An unanswerable permission question is not permission —
        // and the cost of being wrong here is asymmetric: a hidden button on a
        // file the user could have edited is a smaller harm than a button that
        // greets them with an access error.
        canEdit.value = false
      } finally {
        checking.value = false
      }
    },
    { immediate: true },
  )

  return { canEdit, checking }
}
