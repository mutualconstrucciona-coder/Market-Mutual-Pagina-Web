import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { listImportHistory } from '@/lib/admin/import-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return Response.json(await listImportHistory(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
