using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.SignalR;
using Photino.NET;

namespace Desktop;

internal class Program
{
    // Win32 API Constants
    private const int GWL_STYLE = -16;
    private const uint WS_CAPTION = 0x00C00000;
    private const uint WS_THICKFRAME = 0x00040000;
    private const uint WS_MINIMIZEBOX = 0x00020000;
    private const uint WS_MAXIMIZEBOX = 0x00010000;
    private const uint WS_SYSMENU = 0x00080000;

    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOZORDER = 0x0004;

    private const int GWLP_WNDPROC = -4;
    private const uint WM_NCCALCSIZE = 0x0083;
    private const uint WM_NCHITTEST = 0x0084;
    private const int HTCLIENT = 1;

    private const uint WM_GETMINMAXINFO = 0x0024;
    private const int MONITOR_DEFAULTTONEAREST = 2;

    private const uint WM_SYSCOMMAND = 0x0112;
    private const int SC_MOVE = 0xF010;
    private const int HTCAPTION = 2;

    private static WndProcDelegate _wndProcDelegate;
    private static IntPtr _oldWndProc;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, uint dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy,
        uint uFlags);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("dwmapi.dll")]
    private static extern int DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS pMarInset);

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern uint ExtractIconEx(string lpszFile, int nIconIndex, IntPtr[] phiconLarge,
        IntPtr[] phiconSmall, uint nIcons);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired,
        uint fuLoad);

    [DllImport("shell32.dll", SetLastError = true)]
    private static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, WndProcDelegate newProc);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, WndProcDelegate newProc);

    [DllImport("user32.dll", EntryPoint = "SetClassLongPtr")]
    private static extern IntPtr SetClassLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetClassLong")]
    private static extern IntPtr SetClassLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    private static IntPtr SetClassLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong)
    {
        if (IntPtr.Size == 8) return SetClassLongPtr64(hWnd, nIndex, dwNewLong);
        return SetClassLong32(hWnd, nIndex, dwNewLong);
    }

    private static IntPtr SetWndProc(IntPtr hWnd, WndProcDelegate newProc)
    {
        if (IntPtr.Size == 8) return SetWindowLongPtr64(hWnd, GWLP_WNDPROC, newProc);
        return SetWindowLong32(hWnd, GWLP_WNDPROC, newProc);
    }

    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProc(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam,
        IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern int SendMessage(IntPtr hWnd, uint Msg, int wParam, int lParam);

    [DllImport("user32.dll", EntryPoint = "SendMessage")]
    private static extern IntPtr SendMessagePtr(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    private static IntPtr CustomWndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_NCCALCSIZE && wParam != IntPtr.Zero)
        {
            var style = GetWindowLong(hWnd, GWL_STYLE);
            var isMaximized = (style & 0x01000000) != 0; // WS_MAXIMIZE

            if (isMaximized)
            {
                var param = Marshal.PtrToStructure<NCCALCSIZE_PARAMS>(lParam);
                var hMonitor = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST);
                if (hMonitor != IntPtr.Zero)
                {
                    var mi = new MONITORINFO();
                    mi.cbSize = (uint)Marshal.SizeOf<MONITORINFO>();
                    if (GetMonitorInfo(hMonitor, ref mi))
                    {
                        param.rgrc0 = mi.rcWork;
                        Marshal.StructureToPtr(param, lParam, true);
                    }
                }
            }

            return IntPtr.Zero; // Remove entire non-client area (titlebar and borders)
        }

        if (msg == WM_GETMINMAXINFO)
        {
            var ret = CallWindowProc(_oldWndProc, hWnd, msg, wParam, lParam);

            var mmi = Marshal.PtrToStructure<MINMAXINFO>(lParam);
            var hMonitor = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST);
            if (hMonitor != IntPtr.Zero)
            {
                var mi = new MONITORINFO();
                mi.cbSize = (uint)Marshal.SizeOf<MONITORINFO>();
                if (GetMonitorInfo(hMonitor, ref mi))
                {
                    mmi.ptMaxPosition.x = Math.Abs(mi.rcWork.left - mi.rcMonitor.left);
                    mmi.ptMaxPosition.y = Math.Abs(mi.rcWork.top - mi.rcMonitor.top);
                    mmi.ptMaxSize.x = Math.Abs(mi.rcWork.right - mi.rcWork.left);
                    mmi.ptMaxSize.y = Math.Abs(mi.rcWork.bottom - mi.rcWork.top);

                    Marshal.StructureToPtr(mmi, lParam, true);
                }
            }

            return IntPtr.Zero;
        }

        if (msg == WM_NCHITTEST)
        {
            var hit = CallWindowProc(_oldWndProc, hWnd, msg, wParam, lParam);
            if (hit.ToInt32() == HTCLIENT)
            {
                int x = (short)(lParam.ToInt64() & 0xFFFF);
                int y = (short)((lParam.ToInt64() >> 16) & 0xFFFF);
                var pt = new POINT { x = x, y = y };
                ScreenToClient(hWnd, ref pt);

                GetClientRect(hWnd, out var rc);
                var border = 8;
                var left = pt.x < border;
                var right = pt.x > rc.right - border;
                var top = pt.y < border;
                var bottom = pt.y > rc.bottom - border;

                if (top && left) return 13; // HTTOPLEFT
                if (top && right) return 14; // HTTOPRIGHT
                if (bottom && left) return 16; // HTBOTTOMLEFT
                if (bottom && right) return 17; // HTBOTTOMRIGHT
                if (top) return 12; // HTTOP
                if (bottom) return 15; // HTBOTTOM
                if (left) return 10; // HTLEFT
                if (right) return 11; // HTRIGHT

                // Fake the HTCAPTION drag region because WM_NCCALCSIZE 0 breaks native drag
                // Topbar is 42px tall. Avoid the right 150px (window controls) and left 80px (file menu).
                if (pt.y < 42 && pt.x > 80 && pt.x < rc.right - 150) return 2; // HTCAPTION
            }

            return hit;
        }

        return CallWindowProc(_oldWndProc, hWnd, msg, wParam, lParam);
    }

    [STAThread]
    private static void Main(string[] args)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            try
            {
                SetCurrentProcessExplicitAppUserModelID("Synq.Desktop.App");
            }
            catch
            {
            }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        });

        builder.Services.AddSingleton<WorkspaceState>();
        builder.Services.AddSingleton<DocumentManager>();
        builder.Services.AddSingleton<SyncManager>();
        builder.Services.AddSingleton<LanDiscoveryService>();
        builder.Services.AddSingleton<PeerRouter>();
        builder.Services.AddSingleton<PeerSyncHandler>();
        builder.Services.AddSingleton<SignalProxyService>();
        builder.Services.AddSingleton<StunDiagnosticService>();
        builder.Services.AddSingleton<WebRtcPeerManager>();
        builder.Services.AddSingleton<HeartbeatService>();

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend",
                p => p.WithOrigins("http://127.0.0.1:5173", "http://localhost:5173").AllowAnyHeader().AllowAnyMethod()
                    .AllowCredentials());
        });
        builder.Services.AddSignalR(options => { options.MaximumReceiveMessageSize = null; });

        var app = builder.Build();

        // Run STUN diagnostic before anything WAN-related starts
        var stunDiag = app.Services.GetRequiredService<StunDiagnosticService>();
        _ = Task.Run(() => stunDiag.RunDiagnosticAsync());

        var heartbeat = app.Services.GetRequiredService<HeartbeatService>();
        heartbeat.Start();

        app.UseCors("AllowFrontend");

        app.UseDefaultFiles();
        app.UseStaticFiles();

        ApiEndpoints.MapAll(app);

        // If the user navigates to a route (like /settings), serve index.html
        app.MapFallbackToFile("index.html");

        // Start the ASP.NET Core web server on a local port in the background
        const string bindUrl = "http://0.0.0.0:0";
        app.Urls.Add(bindUrl); // Explicitly bind to port 0 (random)
        app.StartAsync().GetAwaiter().GetResult();

        var server = app.Services.GetRequiredService<IServer>();
        var addressFeature = server.Features.Get<IServerAddressesFeature>();
        var serverUrl = addressFeature!.Addresses.First();
        var uri = new Uri(serverUrl.Replace("[::]", "0.0.0.0"));
        var localServerUrl = $"http://127.0.0.1:{uri.Port}";
        var discoveryService = app.Services.GetRequiredService<LanDiscoveryService>();
        discoveryService.Start(uri.Port);

        using (var httpClient = new HttpClient())
        {
            var serverReady = false;
            while (!serverReady)
                try
                {
                    var response = httpClient.GetAsync(localServerUrl + "/api/files").GetAwaiter().GetResult();
                    serverReady = true;
                }
                catch
                {
                    // Server isn't up yet, wait 50ms and try again
                    Thread.Sleep(50);
                }
        }

        // Launch Photino Native Desktop Window
        var isDevelopment = args.Contains("--dev");
        var os = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "windows" :
            RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "mac" : "linux";

        var startUrl = isDevelopment
            ? $"http://127.0.0.1:5173?backend={localServerUrl}&os={os}"
            : $"{localServerUrl}?backend={localServerUrl}&os={os}";


        var window = new PhotinoWindow()
            .SetTitle("Synq")
            .SetSize(1280, 800)
            .SetUseOsDefaultLocation(false)
            .SetUseOsDefaultSize(false)
            .SetContextMenuEnabled(false)
            .SetDevToolsEnabled(true)
            .SetSmoothScrollingEnabled(true)
            .SetFileSystemAccessEnabled(true);

        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux)) window.Center();
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) window.SetChromeless(true);

        window.Load(startUrl);

        var isMaximized = false;
        window.RegisterWebMessageReceivedHandler((sender, message) =>
        {
            var win = (PhotinoWindow)sender!;
            try
            {
                var msg = JsonDocument.Parse(message);
                var action = msg.RootElement.GetProperty("action").GetString();
                switch (action)
                {
                    case "close":
                        win.Close();
                        break;
                    case "minimize":
                        win.SetMinimized(true);
                        break;
                    case "maximize":
                        isMaximized = !isMaximized;
                        win.SetMaximized(isMaximized);
                        break;
                    case "drag":
                        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                        {
                            ReleaseCapture();
                            SendMessage(win.WindowHandle, WM_SYSCOMMAND, SC_MOVE | HTCAPTION, 0);
                        }

                        break;
                    case "openFolder":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        app.Services.GetRequiredService<WebRtcPeerManager>().DisconnectAll();
                        var paths = win.ShowOpenFolder();
                        if (paths != null && paths.Length > 0)
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = paths[0];
                            discoveryService.StartAdvertising();
                            win.SendWebMessage("folderOpened");

                            if (msg.RootElement.TryGetProperty("peer", out var peerEl) &&
                                peerEl.ValueKind != JsonValueKind.Null)
                            {
                                var peerIp = peerEl.GetProperty("ip").GetString();
                                var peerPort = peerEl.GetProperty("port").GetInt32();
                                var pwd = "";
                                if (peerEl.TryGetProperty("password", out var pwdEl) &&
                                    pwdEl.ValueKind != JsonValueKind.Null)
                                    pwd = pwdEl.GetString() ?? "";

                                if (!string.IsNullOrEmpty(pwd))
                                {
                                    state.Settings.PeerPasswords[$"{peerIp}:{peerPort}"] = pwd;
                                    state.SaveSettings();
                                }

                                var ctx = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                                _ = discoveryService.ConnectToPeerAsync(peerIp!, peerPort, ctx);
                            }
                        }

                        break;
                    case "closeFolder":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        app.Services.GetRequiredService<WebRtcPeerManager>().DisconnectAll();
                        discoveryService.StopAdvertising();
                        var stateToClear = app.Services.GetRequiredService<WorkspaceState>();
                        stateToClear.CurrentFolder = string.Empty;
                        win.SendWebMessage("folderClosed");
                        break;
                    case "openRecent":
                        _ = discoveryService.DisconnectFromPeerAsync();
                        app.Services.GetRequiredService<WebRtcPeerManager>().DisconnectAll();
                        var recentPath = msg.RootElement.GetProperty("path").GetString();
                        if (!string.IsNullOrEmpty(recentPath) && Directory.Exists(recentPath))
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            state.CurrentFolder = recentPath;
                            discoveryService.StartAdvertising();
                            win.SendWebMessage("folderOpened");

                            if (msg.RootElement.TryGetProperty("peer", out var peerEl) &&
                                peerEl.ValueKind != JsonValueKind.Null)
                            {
                                var peerIp = peerEl.GetProperty("ip").GetString();
                                var peerPort = peerEl.GetProperty("port").GetInt32();
                                var pwd = "";
                                if (peerEl.TryGetProperty("password", out var pwdEl) &&
                                    pwdEl.ValueKind != JsonValueKind.Null)
                                    pwd = pwdEl.GetString() ?? "";

                                if (!string.IsNullOrEmpty(pwd))
                                {
                                    state.Settings.PeerPasswords[$"{peerIp}:{peerPort}"] = pwd;
                                    state.SaveSettings();
                                }

                                var ctx = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                                _ = discoveryService.ConnectToPeerAsync(peerIp!, peerPort, ctx);
                            }
                        }
                        else
                        {
                            win.SendWebMessage("folderError");
                        }

                        break;
                    case "removeRecent":
                        var pathToRemove = msg.RootElement.GetProperty("path").GetString();
                        if (!string.IsNullOrEmpty(pathToRemove))
                        {
                            var state = app.Services.GetRequiredService<WorkspaceState>();
                            if (state.Settings.RecentFolders.Contains(pathToRemove))
                            {
                                state.Settings.RecentFolders.Remove(pathToRemove);
                                state.SaveSettings();
                            }
                        }

                        break;
                    case "connectPeer":
                        var ip = msg.RootElement.GetProperty("ip").GetString();
                        var port = msg.RootElement.GetProperty("port").GetInt32();
                        var discovery = app.Services.GetRequiredService<LanDiscoveryService>();
                        var hubContext = app.Services.GetRequiredService<IHubContext<DocumentHub>>();
                        Task.Run(() => discovery.ConnectToPeerAsync(ip!, port, hubContext));
                        win.SendWebMessage("connectSuccess");
                        break;
                }
            }
            catch
            {
                // Fallback for simple string messages
                switch (message)
                {
                    case "close":
                        win.Close();
                        break;
                    case "minimize":
                        win.SetMinimized(true);
                        break;
                    case "maximize":
                        isMaximized = !isMaximized;
                        win.SetMaximized(isMaximized);
                        break;
                    case "drag":
                        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                        {
                            ReleaseCapture();
                            SendMessage(win.WindowHandle, WM_SYSCOMMAND, SC_MOVE | HTCAPTION, 0);
                        }

                        break;
                }
            }
        });

        window.WindowCreated += (sender, e) =>
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var hWnd = window.WindowHandle;

                // Subclass the window to intercept WM_NCCALCSIZE
                _wndProcDelegate = CustomWndProc;
                _oldWndProc = SetWndProc(hWnd, _wndProcDelegate);

                // Extend DWM frame into client area to keep drop shadow and animations
                var margins = new MARGINS { cxLeftWidth = 0, cxRightWidth = 0, cyTopHeight = 1, cyBottomHeight = 0 };
                DwmExtendFrameIntoClientArea(hWnd, ref margins);

                // Force frame recalculation so NCCALCSIZE is triggered
                SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER);

                // Force set the taskbar icon directly via Win32 from the EXE resources
                var exePath = Path.Combine(AppContext.BaseDirectory, "Synq.exe");
                var largeIcons = new IntPtr[1];
                var smallIcons = new IntPtr[1];
                ExtractIconEx(exePath, 0, largeIcons, smallIcons, 1);

                if (largeIcons[0] != IntPtr.Zero)
                {
                    SendMessagePtr(hWnd, 0x0080 /*WM_SETICON*/, 1 /*ICON_BIG*/, largeIcons[0]);
                    SetClassLongPtr(hWnd, -14 /*GCLP_HICON*/, largeIcons[0]);
                }

                if (smallIcons[0] != IntPtr.Zero)
                {
                    SendMessagePtr(hWnd, 0x0080 /*WM_SETICON*/, 0 /*ICON_SMALL*/, smallIcons[0]);
                    SetClassLongPtr(hWnd, -34 /*GCLP_HICONSM*/, smallIcons[0]);
                }
            }
        };

        window.WindowClosing += (sender, e) =>
        {
            discoveryService.Stop();
            app.StopAsync().GetAwaiter().GetResult();
            return false;
        };

        window.WaitForClose();
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int left, top, right, bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int x, y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MARGINS
    {
        public int cxLeftWidth, cxRightWidth, cyTopHeight, cyBottomHeight;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct WINDOWPOS
    {
        public IntPtr hwnd;
        public IntPtr hwndInsertAfter;
        public int x;
        public int y;
        public int cx;
        public int cy;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct NCCALCSIZE_PARAMS
    {
        public RECT rgrc0;
        public RECT rgrc1;
        public RECT rgrc2;
        public IntPtr lppos;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO
    {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}