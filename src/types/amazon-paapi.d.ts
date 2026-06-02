declare module 'amazon-paapi' {
  const amazonPaapi: {
    GetItems: (params: Record<string, unknown>) => Promise<unknown>
    SearchItems: (params: Record<string, unknown>) => Promise<unknown>
  }
  export default amazonPaapi
}
