import 'server-only'
import { Writable } from 'node:stream'
import pino from 'pino'
import pretty from 'pino-pretty'
import { getEnv } from '@/lib/env'

const env = getEnv()
const isDev = env.NODE_ENV !== 'production'

// Discord embed colors by pino numeric level.
const EMBED_COLOR: Record<number, number> = {
  30: 0x8be836, // info
  40: 0xffc142, // warn
  50: 0xe83938, // error
  60: 0x8b0000, // fatal
}

// One POST per log line to the Discord webhook. Fire-and-forget: logging
// must never block or throw. Discord rate-limits webhooks at 30/min — keep
// this sink level-gated at warn+ so steady-state traffic stays well under.
function discordSink(url: string): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      try {
        const obj = JSON.parse(chunk.toString()) as Record<string, unknown>
        const { level, time, msg, pid: _pid, hostname: _hostname, ...rest } = obj
        const title = typeof msg === 'string' ? msg.slice(0, 256) : '(no message)'
        // Discord's aggregate embed cap is 6000 chars across title+fields.
        // Warn+ lines often carry stack traces, so budget defensively.
        let budget = 5500 - title.length
        const fields: { name: string; value: string; inline: boolean }[] = []
        for (const [rawName, rawValue] of Object.entries(rest)) {
          if (fields.length >= 25 || budget <= 0) break
          const name = rawName.slice(0, 256)
          const value = String(rawValue).slice(0, Math.min(1024, budget - name.length))
          if (value.length === 0) break
          fields.push({ name, value, inline: true })
          budget -= name.length + value.length
        }
        const embed = {
          title,
          color: EMBED_COLOR[level as number] ?? 0x808080,
          timestamp: new Date(typeof time === 'number' ? time : Date.now()).toISOString(),
          fields,
        }
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        }).catch(() => {})
      } catch {
        // Malformed line or missing fields — drop silently rather than crash.
      }
      callback()
    },
  })
}

const streams: pino.StreamEntry[] = [
  isDev
    ? { stream: pretty({ colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' }) }
    : { stream: process.stdout },
]
if (env.DISCORD_WEBHOOK_URL) {
  streams.push({ level: 'warn', stream: discordSink(env.DISCORD_WEBHOOK_URL) })
}

export const logger = pino(
  { level: env.LOG_LEVEL ?? (isDev ? 'debug' : 'info') },
  pino.multistream(streams),
)
