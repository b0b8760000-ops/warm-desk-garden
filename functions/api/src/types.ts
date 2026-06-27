export type FunctionContext = {
  req: {
    method: string
    path: string
    headers: Record<string, string>
    bodyText?: string
  }
  res: {
    json: (body: unknown, status?: number) => unknown
  }
  log: (message: string) => void
  error: (message: string) => void
}

export type CurrentUser = {
  id: string
  email: string
}
