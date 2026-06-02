export async function GET() {
  return Response.json({ ok: true, service: 'outdoor-deals', framework: 'nextjs' })
}
