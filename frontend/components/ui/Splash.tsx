import { Spinner } from "./Spinner";

export function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-sm">
        S
      </div>
      <Spinner className="h-5 w-5 text-primary" />
    </div>
  );
}
