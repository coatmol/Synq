import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { WelcomeScreen } from "./components/WelcomeScreen";

function App() {
  const [view, setView] = useState<"welcome" | "editor">("welcome");

  if (view === "welcome") {
    return <WelcomeScreen onOpenEditor={() => setView("editor")} />;
  }

  return (
    <AppLayout>
      <EditorWorkspace />
    </AppLayout>
  );
}

export default App;
