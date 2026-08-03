using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Engine;
using Makaretu.Dns;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Desktop;

public class LanDiscoveryService : IDisposable
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, (string IP, int Port)> _discoveredPeers = new();
    private readonly DocumentManager _manager;
    private readonly SyncManager _syncManager;
    private readonly WorkspaceState _workspaceState;
    private bool _isAdvertising;
    private MulticastService? _mdns;
    private Timer? _pingTimer;
    private ServiceDiscovery? _serviceDiscovery;
    private ServiceProfile? _serviceProfile;

    public LanDiscoveryService(DocumentManager manager, SyncManager syncManager, WorkspaceState workspaceState)
    {
        _manager = manager;
        _syncManager = syncManager;
        _workspaceState = workspaceState;
    }

    public int Port { get; private set; }

    public HubConnection? PeerConnection { get; private set; }

    public void Dispose()
    {
        Stop();
        _pingTimer?.Dispose();
        _mdns?.Dispose();
    }

    public void BroadcastQuery()
    {
        _mdns?.SendQuery("_synq._tcp.local", type: DnsType.PTR);
    }

    public void Start(int httpPort)
    {
        Port = httpPort;
        _mdns = new MulticastService();
        _serviceDiscovery = new ServiceDiscovery(_mdns);

        var instanceName = $"{_workspaceState.Settings.Username}-{httpPort}";
        _serviceProfile = new ServiceProfile(instanceName, "_synq._tcp", (ushort)httpPort);

        _mdns.NetworkInterfaceDiscovered += (s, e) => _mdns.SendQuery("_synq._tcp.local", type: DnsType.PTR);

        _serviceDiscovery.ServiceInstanceDiscovered += async (s, e) =>
        {
            var aRecord = e.Message.Answers.OfType<ARecord>().FirstOrDefault() ??
                          e.Message.AdditionalRecords.OfType<ARecord>().FirstOrDefault();
            var srvRecord = e.Message.Answers.OfType<SRVRecord>().FirstOrDefault() ??
                            e.Message.AdditionalRecords.OfType<SRVRecord>().FirstOrDefault();

            if (aRecord != null && srvRecord != null)
            {
                var ipStr = aRecord.Address.ToString();
                var port = srvRecord.Port;
                // Ignore our own broadcast
                if (port == httpPort) return;

                try
                {
                    using var http = new HttpClient();
                    http.Timeout = TimeSpan.FromSeconds(2);
                    var res = await http.GetAsync($"http://{ipStr}:{port}/api/settings");
                    if (res.IsSuccessStatusCode)
                    {
                        _discoveredPeers[e.ServiceInstanceName.ToString()] = (ipStr, port);
                    }
                }
                catch
                {
                    // Peer is dead or unresponsive
                }
            }
        };

        _mdns.Start();

        _pingTimer = new Timer(PingPeers, null, 5000, 5000);
    }

    private async void PingPeers(object? state)
    {
        BroadcastQuery();
        var keys = _discoveredPeers.Keys.ToList();
        using var http = new HttpClient();
        http.Timeout = TimeSpan.FromSeconds(2);

        foreach (var key in keys)
            if (_discoveredPeers.TryGetValue(key, out var peer))
                try
                {
                    var res = await http.GetAsync($"http://{peer.IP}:{peer.Port}/api/settings");
                    if (!res.IsSuccessStatusCode) _discoveredPeers.TryRemove(key, out _);
                }
                catch
                {
                    _discoveredPeers.TryRemove(key, out _);
                }
    }

    public void UpdateUsername(string newUsername)
    {
        if (_serviceProfile != null && _serviceDiscovery != null)
        {
            if (_isAdvertising) _serviceDiscovery.Unadvertise(_serviceProfile);
            _serviceProfile = new ServiceProfile($"{newUsername}-{Port}", "_synq._tcp", (ushort)Port);
            if (_isAdvertising) _serviceDiscovery.Advertise(_serviceProfile);
        }
    }

    public void StartAdvertising()
    {
        if (!_isAdvertising && _serviceDiscovery != null && _serviceProfile != null)
        {
            _serviceDiscovery.Advertise(_serviceProfile);
            _isAdvertising = true;
        }
    }

    public void StopAdvertising()
    {
        if (_isAdvertising && _serviceDiscovery != null && _serviceProfile != null)
        {
            _serviceDiscovery.Unadvertise(_serviceProfile);
            _isAdvertising = false;
        }
    }

    public void Stop()
    {
        StopAdvertising();
        _mdns?.Stop();
    }

    public IEnumerable<object> GetDiscoveredPeers()
    {
        return _discoveredPeers.Select((kvp, index) =>
        {
            var actualName = kvp.Key;
            var lastDash = kvp.Key.LastIndexOf("-");
            if (lastDash > 0) actualName = kvp.Key.Substring(0, lastDash);
            return new
            {
                id = index + 1,
                name = actualName,
                ip = kvp.Value.IP,
                port = kvp.Value.Port,
                status = "online",
                init = actualName.Substring(0, Math.Min(2, actualName.Length)).ToUpper()
            };
        });
    }

    public async Task DisconnectFromPeerAsync()
    {
        if (PeerConnection != null)
        {
            await PeerConnection.StopAsync();
            await PeerConnection.DisposeAsync();
            PeerConnection = null;
        }
    }

    public async Task<bool> ConnectToPeerAsync(string ip, int port, IHubContext<DocumentHub> hubContext)
    {
        try
        {
            using var http = new HttpClient();
            if (_workspaceState.Settings.PeerPasswords.TryGetValue($"{ip}:{port}", out var pwd))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pwd);

            var response = await http.GetAsync($"http://{ip}:{port}/api/sync/manifest");
            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == HttpStatusCode.Unauthorized && !string.IsNullOrEmpty(pwd))
                {
                    _workspaceState.Settings.PeerPasswords.Remove($"{ip}:{port}");
                    _workspaceState.SaveSettings();
                }

                return false;
            }

            var content = await response.Content.ReadAsStringAsync();
            var remoteManifest = JsonSerializer.Deserialize<SyncManifest>(content);

            if (remoteManifest != null)
            {
                // Process manifest diffs locally
                await _syncManager.ProcessRemoteManifest(remoteManifest, $"http://{ip}:{port}");

                // Stop any existing connection
                if (PeerConnection != null) await PeerConnection.StopAsync();

                PeerConnection = new HubConnectionBuilder()
                    .WithUrl($"http://{ip}:{port}/hub", options =>
                    {
                        if (_workspaceState.Settings.PeerPasswords.TryGetValue($"{ip}:{port}", out var pwd2))
                            options.AccessTokenProvider = () => Task.FromResult(pwd2);
                    })
                    .WithAutomaticReconnect()
                    .Build();

                PeerConnection.On<string, List<CharNode>>("SyncNodes", async (filename, nodes) =>
                {
                    var seq = _manager.GetOrCreateDocument(filename);
                    foreach (var node in nodes) seq.RemoteMerge(node);
                    _manager.SaveToDisk(filename);
                    await hubContext.Clients.All.SendAsync("DocumentUpdated", filename, seq.ToString());
                });

                PeerConnection.On<string, string>("ItemRenamed", async (oldPath, newPath) =>
                {
                    var oldAbs = PathUtils.GetSafePath(_workspaceState.CurrentFolder, oldPath);
                    var newAbs = PathUtils.GetSafePath(_workspaceState.CurrentFolder, newPath);
                    if (oldAbs == null || newAbs == null) return;
                    if (File.Exists(oldAbs))
                    {
                        var dir = Path.GetDirectoryName(newAbs);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                        File.Move(oldAbs, newAbs);
                    }
                    else if (Directory.Exists(oldAbs))
                    {
                        Directory.Move(oldAbs, newAbs);
                    }

                    _syncManager.InitializeLocalFolder();
                    await hubContext.Clients.All.SendAsync("ItemRenamed", oldPath, newPath);
                });

                PeerConnection.On<string>("ItemDeleted", async path =>
                {
                    var filePath = PathUtils.GetSafePath(_workspaceState.CurrentFolder, path);
                    if (filePath == null) return;
                    if (File.Exists(filePath)) File.Delete(filePath);
                    else if (Directory.Exists(filePath)) Directory.Delete(filePath, true);
                    _syncManager.InitializeLocalFolder();
                    await hubContext.Clients.All.SendAsync("ItemDeleted", path);
                });

                PeerConnection.On<string>("FileCreated", async filename =>
                {
                    var filePath = PathUtils.GetSafePath(_workspaceState.CurrentFolder, filename);
                    if (filePath == null) return;
                    var dir = Path.GetDirectoryName(filePath);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    if (!File.Exists(filePath))
                        await File.WriteAllTextAsync(filePath, "# " + Path.GetFileNameWithoutExtension(filename));
                    _syncManager.InitializeLocalFolder();
                    await hubContext.Clients.All.SendAsync("FileCreated", filename);
                });

                PeerConnection.On<string>("FolderCreated", async path =>
                {
                    var dirPath = PathUtils.GetSafePath(_workspaceState.CurrentFolder, path);
                    if (dirPath == null) return;
                    if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);
                    _syncManager.InitializeLocalFolder();
                    await hubContext.Clients.All.SendAsync("FolderCreated", path);
                });

                await PeerConnection.StartAsync();
                return true;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"P2P Sync failed: {ex.Message}");
        }

        return false;
    }
}