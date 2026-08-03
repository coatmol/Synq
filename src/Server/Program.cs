using Desktop;

var builder = WebApplication.CreateBuilder(args);

// Register Core Services
builder.Services.AddSingleton<WorkspaceState>();
builder.Services.AddSingleton<DocumentManager>();
builder.Services.AddSingleton<SyncManager>();
builder.Services.AddSingleton<LanDiscoveryService>();
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors("AllowAll");

// Configure the active sync folder
var state = app.Services.GetRequiredService<WorkspaceState>();
var folderEnv = Environment.GetEnvironmentVariable("folder")?.Replace("\"", "").Replace("'", "");
state.CurrentFolder = !string.IsNullOrEmpty(folderEnv) ? folderEnv : Directory.GetCurrentDirectory();
state.IsHeadless = true;
state.Settings.Username = "Server"; // Force the username to "Server" in memory only
var passwordEnv = Environment.GetEnvironmentVariable("password")?.Replace("\"", "").Replace("'", "");
if (!string.IsNullOrEmpty(passwordEnv)) state.Settings.Password = passwordEnv;
if (!Directory.Exists(state.CurrentFolder))
{
    Console.WriteLine($"[Synq Server] Created sync directory: {state.CurrentFolder}");
    Directory.CreateDirectory(state.CurrentFolder);
}

// Map the unified API
ApiEndpoints.MapAll(app);

// Bind to port
var portEnv = Environment.GetEnvironmentVariable("port") ?? "5454";
if (!int.TryParse(portEnv, out var port)) port = 5454;
app.Urls.Add($"http://0.0.0.0:{port}");

// Start the server natively
_ = Task.Run(() =>
{
    Console.WriteLine($"[Synq Server] Binding to 0.0.0.0:{port}");
    Console.WriteLine($"[Synq Server] Syncing folder: {state.CurrentFolder}");
    app.Run();
});

// Wait slightly to ensure ASP.NET is listening
Thread.Sleep(500);

// Start mDNS peer discovery
var discovery = app.Services.GetRequiredService<LanDiscoveryService>();
discovery.Start(port);
discovery.StartAdvertising();
Console.WriteLine($"[Synq Server] mDNS Discovery Active on port {port}. Always-On peer is ready.");

// Keep process alive indefinitely
await Task.Delay(-1);