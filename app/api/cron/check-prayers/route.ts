import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Lazy init — called inside handlers so env vars are available at runtime
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return webpush;
}

const LEAD_MINUTES = 15;

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

interface PrayerEntry {
  name: string;
  label: string;
  time: string;
  dateStr: string;
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  schedule: PrayerEntry[];
  tz_offset: number;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const wp = getWebPush();

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, schedule, tz_offset');

  if (error || !subs) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  let notifsSent = 0;
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    (subs as Subscription[]).map(async (sub) => {
      // tz_offset = JS getTimezoneOffset() value (WIB = 420 = UTC+7)
      const localMs = Date.now() - sub.tz_offset * 60 * 1000;
      const localNow = new Date(localMs);
      const todayStr = localNow.toISOString().slice(0, 10);
      const nowMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();

      for (const { name, label, time, dateStr } of sub.schedule ?? []) {
        if (dateStr !== todayStr) continue;
        const pMin = timeToMinutes(time);

        if (nowMinutes === pMin - LEAD_MINUTES) {
          await sendPush(wp, sub, {
            title: `🕌 ${label} dalam 15 menit`,
            body: `Waktu ${label} pukul ${time}`,
            tag: `${name}-reminder-${todayStr}`,
          }, staleEndpoints);
          notifsSent++;
        }

        if (nowMinutes === pMin) {
          await sendPush(wp, sub, {
            title: `🕌 Waktu ${label} telah tiba`,
            body: `Saatnya shalat ${label} — ${time}`,
            tag: `${name}-ontime-${todayStr}`,
          }, staleEndpoints);
          notifsSent++;
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints);
    console.log(`[cron] Removed ${staleEndpoints.length} stale subscriptions`);
  }

  return NextResponse.json({
    ok: true,
    processed: subs.length,
    sent: notifsSent,
    removed: staleEndpoints.length,
  });
}

async function sendPush(
  wp: typeof webpush,
  sub: Subscription,
  payload: { title: string; body: string; tag: string },
  staleEndpoints: string[]
) {
  try {
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
      const statusCode = (err as { statusCode: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }
}
