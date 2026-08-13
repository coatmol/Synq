import {useState, useEffect} from "react";
import {AppLayout} from "./components/AppLayout";
import {EditorWorkspace} from "./components/EditorWorkspace";
import {WelcomeScreen} from "./components/WelcomeScreen";
import {SettingsModal} from "./components/SettingsModal";

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

  return (
    <>
      <SettingsModal />
      {view === "welcome" ? (
        <WelcomeScreen onOpenEditor={() => setView("editor")}/>
      ) : (
        <AppLayout>
          <EditorWorkspace/>
        </AppLayout>
      )}
    </>
  );
}

export default App;
