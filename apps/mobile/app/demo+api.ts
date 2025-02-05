export function GET() {
  return Response.json({
    message: "Hello from the API!",
    timestamp: new Date().toISOString(),
  });
}
