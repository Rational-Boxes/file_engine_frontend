import FileEngineClient from 'fileengine-grpc-client'
import { tokenStorage } from '@/utils/tokenStorage'

class GrpcService {
  private client: FileEngineClient

  constructor() {
    // Use the gRPC server address from environment or default to localhost:50051
    const serverAddress = import.meta.env.VITE_FILEENGINE_GRPC_URL || 'localhost:50051'
    this.client = new FileEngineClient(serverAddress)
  }

  get grpcClient(): FileEngineClient {
    return this.client
  }

  // Helper method to extract tenant from subdomain
  private getTenantFromSubdomain(): string {
    const hostname = window.location.hostname
    // Exclude 'www' and extract tenant from subdomain
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // For local development, use default tenant
      return 'default'
    }

    // Split hostname into parts
    const parts = hostname.split('.')

    // If there are more than 2 parts (e.g., tenant.example.com),
    // and the first part is not 'www', use it as tenant
    if (parts.length > 2 && parts[0] !== 'www') {
      return parts[0]
    }

    // Otherwise, use default tenant
    return 'default'
  }

  // Helper method to get user info from token
  private getUserFromToken(): { user: string; tenant: string } {
    const token = tokenStorage.getAccessToken()
    if (!token) {
      return { user: 'anonymous', tenant: this.getTenantFromSubdomain() }
    }

    // Decode JWT token to extract user and tenant info
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { user: 'anonymous', tenant: this.getTenantFromSubdomain() }
      }

      const payload = JSON.parse(atob(parts[1]))
      // Use tenant from token if available, otherwise extract from subdomain
      const tokenTenant = payload.tenant || payload.tenant_id
      return {
        user: payload.sub || payload.user || 'anonymous',
        tenant: tokenTenant || this.getTenantFromSubdomain()
      }
    } catch (error) {
      console.error('Error decoding token:', error)
      return { user: 'anonymous', tenant: this.getTenantFromSubdomain() }
    }
  }

  // Get user context from token
  getUserContext(): { user: string; tenant: string } {
    return this.getUserFromToken()
  }
}

export default new GrpcService()