export class PraamidAuthError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodySnippet: string,
  ) {
    super(`Praamid ${status} ${url}: ${bodySnippet}`)
    this.name = 'PraamidAuthError'
  }
}
