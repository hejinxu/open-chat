const COMMAND_REGEX = /<!--\s*COMMAND:({[\s\S]*?})\s*-->/g

export interface Command {
  action: string
  params?: Record<string, any>
}

export function extractCommands(content: string): Command[] {
  const commands: Command[] = []
  const regex = new RegExp(COMMAND_REGEX.source, COMMAND_REGEX.flags)
  let match = regex.exec(content)
  while (match !== null) {
    try {
      commands.push(JSON.parse(match[1]))
    }
    catch { /* ignore malformed JSON */ }
    match = regex.exec(content)
  }
  return commands
}

export function stripCommands(content: string): string {
  return content.replace(COMMAND_REGEX, '').trim()
}
