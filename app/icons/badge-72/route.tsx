import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 72,
          height: 72,
          background: '#064e3b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }}>🕌</div>
      </div>
    ),
    { width: 72, height: 72 }
  );
}
