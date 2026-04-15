export async function GET() {
  const res = await fetch("https://equran.id/api/v2/shalat/provinsi");
  const data = await res.json();
  return Response.json(data);
}
