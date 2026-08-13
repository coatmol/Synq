import {useState, useEffect} from "react";
import {AppLayout} from "./components/AppLayout";
import {EditorWorkspace} from "./components/EditorWorkspace";
import {WelcomeScreen} from "./components/WelcomeScreen";
import {SettingsModal} from "./components/SettingsModal";
import {api} from "./api";
import {toast} from "sonner";

function App() {
  const [view, setView] = useState<"welcome" | "editor">("welcome");

  useEffect(() => {
    // Check for updates on startup
    api.checkForUpdates().then(updateInfo => {
      if (updateInfo?.updateAvailable) {
        toast.info("Update Available", {
          description: `Synq version ${updateInfo.latest} is available!`,
          duration: 10000,
          action: {
            label: "Open Settings",
            onClick: () => window.dispatchEvent(new Event('open-settings'))
          }
        });
      }
    }).catch(() => {
      // Silently ignore update check errors on startup
    });

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
