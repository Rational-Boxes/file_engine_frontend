import axios, { AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'

const API_BASE_URL = import.meta.env.VUE_APP_FILEENGINE_API_URL || 'http://localhost:8080'

class ApiService {
  private apiClient: AxiosInstance

  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    // Request interceptor to add JWT token
    this.apiClient.interceptors.request.use(
      (config) => {
        const token = tokenStorage.getAccessToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor to handle common errors
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - redirect to login
          tokenStorage.clearTokens()
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  get client(): AxiosInstance {
    return this.apiClient
  }
}

export default new ApiService()