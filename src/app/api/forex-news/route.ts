import { getEconomicCalendar } from '@/services/economic-calendar';
import { newsJson, newsUser } from '@/lib/forex-news/server';
export const runtime = 'nodejs';
export async function GET() {
  if (!await newsUser()) return newsJson({ error: 'Silakan login kembali.' }, 401);
  try { return newsJson({ ...await getEconomicCalendar(), serverTime: new Date().toISOString() }); }
  catch (error) { return newsJson({ error: error instanceof Error ? error.message : 'Kalender tidak tersedia.' }, 503); }
}
