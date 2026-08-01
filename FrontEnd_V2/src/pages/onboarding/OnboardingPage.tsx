import { useState } from "react";

import { Brand } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

import { FoundationSection } from "./FoundationSection";
import { SectionTwoPlaceholder } from "./SectionTwoPlaceholder";

type OnboardingPhase = "foundation" | "section2";

export function OnboardingPage() {
    const [phase, setPhase] = useState<OnboardingPhase>("foundation");

    return (
        <div className="min-vh-100 d-flex flex-column">
            <header className="d-flex align-items-center justify-content-between px-3 px-md-5 py-3">
                <Brand />
                <ThemeToggle />
            </header>

            <main className="container-fluid px-3 px-md-5 pb-4 pb-md-5">
                <div className="row g-4 justify-content-center">
                    <div className="col-12 col-xl-8">
                        {phase === "foundation" ? (
                            <FoundationSection onCompleted={() => setPhase("section2")} />
                        ) : (
                            <SectionTwoPlaceholder />
                        )}
                    </div>
                    <button onClick={() => setPhase("foundation")}>Back</button>
                </div>
            </main>
        </div>
    );
}
