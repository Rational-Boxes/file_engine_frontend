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

// Typed method layer over the folder_actions API. Mirrors discussionService.

import folderActionsClient from '@/services/folderActionsClient'
import type {
  ActionType, ActionBinding, BindingCreate, BindingUpdate, SorterRoute, ActionRun,
  ClassifierSetSummary, ClassifierSetFull, ClassifierTestResult, Classifier,
  NotifyTemplateSummary, NotifyTemplate, NotifyTemplateInput,
} from '@/types/folderActions'

export const folderActionsService = {
  // --- action type catalog (the generic form schemas) ---
  async listActionTypes(): Promise<ActionType[]> {
    const { data } = await folderActionsClient.get('/action-types')
    return data
  },

  // --- bindings ---
  async listBindings(folderUid: string): Promise<ActionBinding[]> {
    const { data } = await folderActionsClient.get(
      `/folders/${encodeURIComponent(folderUid)}/actions`)
    return data
  },
  async createBinding(folderUid: string, body: BindingCreate): Promise<ActionBinding> {
    const { data } = await folderActionsClient.post(
      `/folders/${encodeURIComponent(folderUid)}/actions`, body)
    return data
  },
  async getBinding(bindingId: string): Promise<ActionBinding> {
    const { data } = await folderActionsClient.get(`/actions/${bindingId}`)
    return data
  },
  async updateBinding(bindingId: string, body: BindingUpdate): Promise<ActionBinding> {
    const { data } = await folderActionsClient.put(`/actions/${bindingId}`, body)
    return data
  },
  async deleteBinding(bindingId: string): Promise<void> {
    await folderActionsClient.delete(`/actions/${bindingId}`)
  },

  // --- sorter routes ---
  async getRoutes(bindingId: string): Promise<SorterRoute[]> {
    const { data } = await folderActionsClient.get(`/actions/${bindingId}/routes`)
    return data
  },
  async setRoutes(bindingId: string, routes: SorterRoute[]): Promise<SorterRoute[]> {
    const { data } = await folderActionsClient.put(`/actions/${bindingId}/routes`, routes)
    return data
  },

  // --- run log ---
  async folderRuns(folderUid: string, limit = 100): Promise<ActionRun[]> {
    const { data } = await folderActionsClient.get(
      `/folders/${encodeURIComponent(folderUid)}/runs`, { params: { limit } })
    return data
  },
  async bindingRuns(bindingId: string, limit = 100): Promise<ActionRun[]> {
    const { data } = await folderActionsClient.get(
      `/actions/${bindingId}/runs`, { params: { limit } })
    return data
  },

  // --- classifier sets (editor, §7.3.1) ---
  async listClassifierSets(): Promise<ClassifierSetSummary[]> {
    const { data } = await folderActionsClient.get('/classifier-sets')
    return data
  },
  async getClassifierSet(setId: string): Promise<ClassifierSetFull> {
    const { data } = await folderActionsClient.get(`/classifier-sets/${setId}`)
    return data
  },
  async createClassifierSet(name: string): Promise<{ id: string }> {
    const { data } = await folderActionsClient.post('/classifier-sets', { name })
    return data
  },
  async updateClassifierSet(setId: string, body: { name: string; classifiers: Classifier[] })
      : Promise<ClassifierSetFull> {
    const { data } = await folderActionsClient.put(`/classifier-sets/${setId}`, body)
    return data
  },
  async deleteClassifierSet(setId: string): Promise<void> {
    await folderActionsClient.delete(`/classifier-sets/${setId}`)
  },
  async importClassifierYaml(yaml: string): Promise<{ id: string }> {
    // Send raw YAML as the request body (the endpoint accepts a raw body or file).
    const { data } = await folderActionsClient.post('/classifier-sets/import', yaml,
      { headers: { 'Content-Type': 'application/x-yaml' } })
    return data
  },
  async exportClassifierYaml(setId: string): Promise<string> {
    const { data } = await folderActionsClient.get(`/classifier-sets/${setId}/export`,
      { responseType: 'text' })
    return data
  },
  async testClassifierSet(setId: string, body: { text?: string; file_uid?: string })
      : Promise<ClassifierTestResult> {
    const { data } = await folderActionsClient.post(`/classifier-sets/${setId}/test`, body)
    return data
  },

  // --- event-notification email templates (§7.2) ---
  async listNotifyTemplates(): Promise<NotifyTemplateSummary[]> {
    const { data } = await folderActionsClient.get('/notify-templates')
    return data
  },
  async getNotifyTemplate(id: string): Promise<NotifyTemplate> {
    const { data } = await folderActionsClient.get(`/notify-templates/${id}`)
    return data
  },
  async createNotifyTemplate(body: NotifyTemplateInput): Promise<NotifyTemplate> {
    const { data } = await folderActionsClient.post('/notify-templates', body)
    return data
  },
  async updateNotifyTemplate(id: string, body: Partial<NotifyTemplateInput>): Promise<NotifyTemplate> {
    const { data } = await folderActionsClient.put(`/notify-templates/${id}`, body)
    return data
  },
  async deleteNotifyTemplate(id: string): Promise<void> {
    await folderActionsClient.delete(`/notify-templates/${id}`)
  },
}

export default folderActionsService
