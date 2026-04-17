import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: 'linear-gradient(135deg, #064e3b 0%, #0d1117 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 288, lineHeight: 1 }}>🕌</div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
