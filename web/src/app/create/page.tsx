import { Suspense } from "react";
import { CreateForm } from "./create-form";

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-9 sm:px-6">
      <h1 className="font-display text-[34px] font-black tracking-[-0.01em] sm:text-[40px]">Start a campaign</h1>
      <p className="mt-1.5 max-w-[640px] text-muted">
        Your goal, deadline and asset are written into the contract and can&apos;t be changed after creation. Choose them carefully.
      </p>
      <Suspense>
        <CreateForm />
      </Suspense>
    </div>
  );
}
