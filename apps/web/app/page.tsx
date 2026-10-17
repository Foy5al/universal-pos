export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Universal POS</h1>
      <p className="text-base text-neutral-600">
        P1 foundation is up. Administration and POS screens land in later increments.
      </p>
      <p className="text-sm text-neutral-500">
        API health is available at <code>/health</code> on the API service.
      </p>
    </main>
  );
}
