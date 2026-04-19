import 'server-only'

type Fields = Record<string, unknown> | undefined

const enableDebug = process.env.LOG_LEVEL === 'debug' || process.env.DEBUG === '1'

function fmt(scope: string, level: string, msg: string, fields?: Fields) {
  const ts = new Date().toISOString()
  const tail = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ''
  return `${ts} [${level}] [${scope}] ${msg}${tail}`
}

export function createLogger(scope: string) {
  return {
    info(msg: string, fields?: Fields) {
      console.log(fmt(scope, 'info', msg, fields))
    },
    warn(msg: string, fields?: Fields) {
      console.warn(fmt(scope, 'warn', msg, fields))
    },
    error(msg: string, fields?: Fields) {
      console.error(fmt(scope, 'error', msg, fields))
    },
    debug(msg: string, fields?: Fields) {
      if (enableDebug) console.debug(fmt(scope, 'debug', msg, fields))
    },
  }
}
