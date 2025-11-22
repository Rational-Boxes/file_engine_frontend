import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileBrowserView from '@/views/FileBrowserView.vue'
import { createTestingPinia } from '@pinia/testing'
import { useFileStore } from '@/stores/files'

describe('FileBrowserView', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()
  })

  it('should render correctly with loading state', () => {
    // Create a testing pinia instance
    const testingPinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        files: {
          currentDirectoryItems: [],
          loading: true,
          selectedItems: [],
        }
      }
    })

    const wrapper = mount(FileBrowserView, {
      global: {
        plugins: [testingPinia]
      }
    })

    expect(wrapper.find('.loading').exists()).toBe(true)
    expect(wrapper.find('.loading').text()).toBe('Loading...')
  })

  it('should render file items when not loading', async () => {
    // Create a testing pinia instance
    const testingPinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        files: {
          currentDirectoryItems: [
            { id: 'file1', name: 'document.pdf', type: 'file', size: 1024, isDirectory: false, isFile: true },
            { id: 'dir1', name: 'images', type: 'directory', size: undefined, isDirectory: true, isFile: false }
          ],
          loading: false,
          selectedItems: [],
        }
      }
    })

    const wrapper = mount(FileBrowserView, {
      global: {
        plugins: [testingPinia]
      }
    })

    // Wait for component to update
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.loading').exists()).toBe(false)
    expect(wrapper.findAll('.file-item')).toHaveLength(2)
    
    const fileItems = wrapper.findAll('.file-item')
    expect(fileItems[0].find('.item-name').text()).toBe('document.pdf')
    expect(fileItems[1].find('.item-name').text()).toBe('images')
  })

  it('should call createDirectory when new folder button is clicked', async () => {
    // Mock window.prompt to return a directory name
    const promptMock = vi.spyOn(window, 'prompt').mockReturnValue('new-directory')
    
    // Create a testing pinia instance
    const testingPinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        files: {
          currentDirectoryItems: [],
          loading: false,
          selectedItems: [],
        }
      }
    })

    const wrapper = mount(FileBrowserView, {
      global: {
        plugins: [testingPinia]
      }
    })

    const fileStore = useFileStore()
    const createDirectorySpy = vi.spyOn(fileStore, 'createDirectory')

    // Click the new folder button
    await wrapper.find('.btn-primary').trigger('click')

    expect(promptMock).toHaveBeenCalledWith('Enter directory name:')
    expect(createDirectorySpy).toHaveBeenCalledWith('new-directory')
    
    // Clean up
    promptMock.mockRestore()
  })
})