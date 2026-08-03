import { useState, useEffect } from "react";
import { AppLayout } from "./components/AppLayout";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { WelcomeScreen } from "./components/WelcomeScreen";

function App() {
  const [view, setView] = useState<"welcome" | "editor">("welcome");

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.receiveMessage) {
      (window as any).external.receiveMessage((msg: string) => {
        if (msg === 'folderOpened') {
          setView('editor');
        } else if (msg === 'folderClosed') {
          setView('welcome');
        }
      });
    }
  }, []);

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
