using System.Text.Json;

namespace Desktop;

public class AppSettings
{
    public string Username { get; set; } = Environment.UserName;
    public List<string> RecentFolders { get; set; } = new();
}

public class WorkspaceState
{
    private readonly string _settingsFilePath;
    private string _currentFolder;

    public WorkspaceState()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var synqDir = Path.Combine(appData, "Synq");
        if (!Directory.Exists(synqDir))
            Directory.CreateDirectory(synqDir);

        _settingsFilePath = Path.Combine(synqDir, "settings.json");
        LoadSettings();

        // Initialize CurrentFolder without triggering setter immediately if possible, 
        // but we want to ensure it's in the recent list.
        if (Settings.RecentFolders.Count > 0)
        {
            _currentFolder = Settings.RecentFolders[0];
        }
        else
        {
            _currentFolder = Path.Combine(AppContext.BaseDirectory, "Notes");
            if (!Directory.Exists(_currentFolder))
                Directory.CreateDirectory(_currentFolder);
            AddRecentFolder(_currentFolder);
        }
    }

    public string CurrentFolder
    {
        get => _currentFolder;
        set
        {
            if (_currentFolder != value)
            {
                _currentFolder = value;
                AddRecentFolder(value);
            }
        }
    }

    public AppSettings Settings { get; private set; } = new();

    private void LoadSettings()
    {
        if (File.Exists(_settingsFilePath))
            try
            {
                var json = File.ReadAllText(_settingsFilePath);
                Settings = JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
                Settings.RecentFolders ??= new List<string>();
            }
            catch
            {
                Settings = new AppSettings();
            }
        else
            Settings = new AppSettings();
    }

    public void SaveSettings()
    {
        try
        {
            var json = JsonSerializer.Serialize(Settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_settingsFilePath, json);
        }
        catch
        {
        }
    }

    public void AddRecentFolder(string folder)
    {
        if (string.IsNullOrEmpty(folder)) return;

        Settings.RecentFolders.Remove(folder);
        Settings.RecentFolders.Insert(0, folder);

        if (Settings.RecentFolders.Count > 10) Settings.RecentFolders = Settings.RecentFolders.Take(10).ToList();

        SaveSettings();
    }
}