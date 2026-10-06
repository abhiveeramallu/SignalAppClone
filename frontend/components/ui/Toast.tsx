export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}
