const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateNtfyTopic(prefix = 'pp-', length = 16) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return prefix + out
}
