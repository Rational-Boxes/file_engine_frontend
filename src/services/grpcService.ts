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

  // Helper method to get user info from token
  private getUserFromToken(): { user: string; tenant: string } {
    const token = tokenStorage.getAccessToken()
    if (!token) {
      return { user: 'anonymous', tenant: 'default' }
    }

    // Decode JWT token to extract user and tenant info
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { user: 'anonymous', tenant: 'default' }
      }

      const payload = JSON.parse(atob(parts[1]))
      return {
        user: payload.sub || payload.user || 'anonymous',
        tenant: payload.tenant || 'default'
      }
    } catch (error) {
      console.error('Error decoding token:', error)
      return { user: 'anonymous', tenant: 'default' }
    }
  }

  // Get user context from token
  getUserContext(): { user: string; tenant: string } {
    return this.getUserFromToken()
  }
}

export default new GrpcService()