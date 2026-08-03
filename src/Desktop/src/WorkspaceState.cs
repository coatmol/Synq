using System.Text.Json;

using System.Text.Json.Serialization;
using System.Text;

namespace Desktop;

public class AppSettings
{
    public string Username { get; set; } = Environment.UserName;
    
    [JsonIgnore]
    public string Password { get; set; } = "";
    
    [JsonPropertyName("password")]
    public string PasswordBase64 
    { 
        get => string.IsNullOrEmpty(Password) ? "" : Convert.ToBase64String(Encoding.UTF8.GetBytes(Password));
        set 
        {
            if (string.IsNullOrEmpty(value)) Password = "";
            else 
            {
                try { Password = Encoding.UTF8.GetString(Convert.FromBase64String(value)); }
                catch { Password = value; }
            }
        }
    }
    
    public List<string> RecentFolders { get; set; } = new();
    
    [JsonIgnore]
    public Dictionary<string, string> PeerPasswords { get; set; } = new();
    
    [JsonPropertyName("peerPasswords")]
    public Dictionary<string, string> PeerPasswordsBase64
    {
        get => PeerPasswords.ToDictionary(kvp => kvp.Key, kvp => Convert.ToBase64String(Encoding.UTF8.GetBytes(kvp.Value)));
        set 
        {
            PeerPasswords = new Dictionary<string, string>();
            if (value != null)
            {
                foreach (var kvp in value)
                {
                    try { PeerPasswords[kvp.Key] = Encoding.UTF8.GetString(Convert.FromBase64String(kvp.Value)); }
                    catch { PeerPasswords[kvp.Key] = kvp.Value; }
                }
            }
        }
    }
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