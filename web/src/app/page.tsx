import { Suspense } from "react";
import { Home } from "./home";

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
