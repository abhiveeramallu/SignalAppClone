import { Spinner } from "./Spinner";

export function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-semibold text-white shadow-sm">
        S
      </div>
      <Spinner className="h-5 w-5 text-blue-600" />
    </div>
  );
}
