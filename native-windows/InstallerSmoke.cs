// Test harness only. Not compiled into the application or installer payload.
using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Wpf;

internal static class InstallerSmoke {
    [STAThread] static int Main(string[] args) {
        Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", args[0]);
        string report = args[1];
        var app = new Application();
        var type = Assembly.LoadFrom(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "中育工具箱-aoki.exe")).GetType("ToolboxWindow", true);
        var window = (Window)Activator.CreateInstance(type, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null, new object[] { false }, null);
        window.Opacity = 0; window.ShowInTaskbar = false; window.ShowActivated = false;
        var view = (WebView2)((Grid)window.Content).Children[0];
        int result = 1;
        bool checking = false;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        Action<string, int> finish = (message, code) => { timer.Stop(); File.WriteAllText(report, message); result = code; window.Close(); app.Shutdown(); };
        timer.Tick += (s, e) => finish("Launch timed out", 1);
        view.CoreWebView2InitializationCompleted += (s, e) => {
            if (!e.IsSuccess) { finish("WebView2 initialization failed", 1); return; }
            if (Path.GetFullPath(view.CoreWebView2.Environment.UserDataFolder).TrimEnd('\\') != Path.GetFullPath(args[0]).TrimEnd('\\')) {
                finish("Isolated profile was not honored", 1); return;
            }
            view.CoreWebView2.NavigationCompleted += async (sender, nav) => {
                if (checking) return;
                checking = true;
                if (!nav.IsSuccess) { finish("Production navigation failed: " + nav.WebErrorStatus, 1); return; }
                try {
                    for (int attempt = 0; attempt < 40; attempt++) {
                        // Inspect public login-page DOM only, never account storage.
                        var ready = await view.CoreWebView2.ExecuteScriptAsync("Boolean(document.querySelector('#app')?.children.length && document.body.innerText.includes('云笔记') && document.body.innerText.includes('登录'))");
                        if (ready == "true") { finish("{\"passed\":true,\"checks\":[\"installed production window\",\"isolated WebView2 profile\",\"local production page and Vue login UI\"]}", 0); return; }
                        await Task.Delay(250);
                    }
                    finish("Production login UI did not render", 1);
                } catch (Exception ex) { finish(ex.ToString(), 1); }
            };
        };
        timer.Start(); app.Run(window); return result;
    }
}
