namespace Desktop;

public class WorkspaceState
{
    public string CurrentFolder { get; set; } = Path.Combine(AppContext.BaseDirectory, "Notes");

    public WorkspaceState()
    {
        if (!Directory.Exists(CurrentFolder))
            Directory.CreateDirectory(CurrentFolder);
    }
}
