declare module 'amazon-paapi' {
  const amazonPaapi: {
    GetItems: (
      commonParameters: Record<string, unknown>,
      requestParameters: Record<string, unknown>,
    ) => Promise<unknown>
    GetItemsV2: (
      commonParameters: Record<string, unknown>,
      requestParameters: Record<string, unknown>,
    ) => Promise<unknown>
    SearchItems: (
      commonParameters: Record<string, unknown>,
      requestParameters: Record<string, unknown>,
    ) => Promise<unknown>
    SearchItemsV2: (
      commonParameters: Record<string, unknown>,
      requestParameters: Record<string, unknown>,
    ) => Promise<unknown>
  }
  export default amazonPaapi
}
