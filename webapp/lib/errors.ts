// Custom error classes for standardized error handling

export class NoAgentsConfiguredError extends Error {
  code = 'NO_AGENTS_CONFIGURED'
  constructor() {
    super('No agents configured. Please add an agent via the admin UI.')
    this.name = 'NoAgentsConfiguredError'
  }
}

export class AgentNotFoundError extends Error {
  code = 'AGENT_NOT_FOUND'
  agentId: string
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`)
    this.name = 'AgentNotFoundError'
    this.agentId = agentId
  }
}

export class UnauthorizedError extends Error {
  code = 'UNAUTHORIZED'
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}
