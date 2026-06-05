import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    user: {
      userId: string
      email: string
      role: 'user' | 'admin'
    }
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string
      email: string
      role: 'user' | 'admin'
    }
  }
}
