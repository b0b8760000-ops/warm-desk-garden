const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://b0b8760000-ops.github.io',
  'https://defect-system-bco5.onrender.com',
  'https://warm-desk-garden.onrender.com',
]

export function buildAllowedOrigins(configuredOrigins = '') {
  return [
    ...new Set([
      ...defaultAllowedOrigins,
      ...configuredOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ]),
  ]
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) return true
  return allowedOrigins.includes(origin)
}
