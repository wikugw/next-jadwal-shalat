import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: 'linear-gradient(135deg, #064e3b 0%, #0d1117 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 108, lineHeight: 1 }}>🕌</div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
