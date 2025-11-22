import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import apiService from '@/services/apiService'
import axios from 'axios'

// Mock axios
vi.mock('axios', async () => {
  const actual = await vi.importActual('axios')
  return {
    ...actual,
    default: {
      create: vi.fn(() => ({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        },
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        put: vi.fn(),
      }))
    }
  }
})

describe('API Service', () => {
  beforeEach(() => {
    // Reset the mock before each test
    vi.clearAllMocks()
  })

  it('should create an axios instance with correct configuration', () => {
    // The service is initialized in the module, so we just check that the mock was called appropriately
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: expect.any(String),
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
  })

  it('should have a client property that returns the axios instance', () => {
    const client = apiService.client
    expect(client).toBeDefined()
    expect(typeof client.get).toBe('function')
    expect(typeof client.post).toBe('function')
    expect(typeof client.delete).toBe('function')
  })
})