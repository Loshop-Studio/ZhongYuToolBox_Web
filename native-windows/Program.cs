using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Net;
using System.Net.Http;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

internal static class Program {
    [STAThread] public static int Main(string[] args) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        if (args.Contains("--self-test")) return ToolboxWindow.SelfTest();
        string devUrl = null;
        var devIndex = Array.IndexOf(args, "--dev-url");
        if (devIndex >= 0) {
            if (devIndex + 1 >= args.Length) return 2;
            devUrl = args[devIndex + 1];
            if (!ToolboxWindow.ValidDevUrl(devUrl)) return 2;
        }
        var app = new Application();
        app.Run(new ToolboxWindow(args.Contains("--qa"), devUrl));
        return Environment.ExitCode;
    }
}

internal sealed class ToolboxWindow : Window {
    const string LocalOrigin = "https://toolbox.local";
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZhongYuToolbox-aoki-WebView2");
    readonly Grid grid = new Grid();
    readonly Canvas guestLayer = new Canvas { IsHitTestVisible = false };
    readonly WebView2 main = new WebView2();
    WebView2 guest;
    string guestId;
    bool guestLoaded;
    string guestError;
    bool closing;
    readonly bool qa;
    readonly Uri devOrigin;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
    readonly Dictionary<string, SaveSession> saves = new Dictionary<string, SaveSession>();
    readonly HttpClient http = new HttpClient(new HttpClientHandler {
        AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
        UseCookies = false, AllowAutoRedirect = false
    }) { Timeout = TimeSpan.FromMinutes(5) };
    CoreWebView2Environment environment;
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    public ToolboxWindow(bool qaMode, string devUrl = null) {
        qa = qaMode;
        devOrigin = devUrl == null ? null : new Uri(devUrl);
        Title = "中育工具箱 · aoki" + (devOrigin == null ? "" : " · 开发模式");
        var iconPath = Path.Combine(root, "dist", "icon.png");
        if (File.Exists(iconPath)) Icon = System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(iconPath));
        Width = 1280; Height = 820; MinWidth = 800; MinHeight = 600;
        Background = new SolidColorBrush(Color.FromRgb(240, 238, 233));
        grid.Children.Add(main); grid.Children.Add(guestLayer); Content = grid;
        Loaded += async (s, e) => {
            try { await Initialize(); }
            catch (Exception ex) {
                if (qa) { WriteQa(new { error = ex.Message }); Close(); return; }
                MessageBox.Show(this, "启动失败：" + ex.Message + "\n请确认已安装 Microsoft Edge WebView2 Runtime，并保留完整程序目录。", Title);
                Close();
            }
        };
        Closed += (s, e) => {
            closing = true; CloseGuest();
            foreach (var item in saves.Values) item.Abort();
            saves.Clear(); main.Dispose(); http.Dispose();
        };
    }
    async Task Initialize() {
        if (qa) File.AppendAllText(Path.Combine(root, "qa-trace.txt"), "Initializing WebView2\n");
        // Official school APIs may use HTTP; TLS validation for HTTPS remains enabled.
        var options = new CoreWebView2EnvironmentOptions("--allow-running-insecure-content");
        var userData = profile + (devOrigin == null ? "" : "-dev") + (qa ? "-qa" : "");
        environment = await CoreWebView2Environment.CreateAsync(null, userData, options);
        if (closing) return;
        await main.EnsureCoreWebView2Async(environment);
        var core = main.CoreWebView2;
        core.SetVirtualHostNameToFolderMapping("toolbox.local", Path.Combine(root, "dist"), CoreWebView2HostResourceAccessKind.DenyCors);
        core.Settings.AreHostObjectsAllowed = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreDevToolsEnabled = qa || devOrigin != null;
        core.WebMessageReceived += Message;
        core.NavigationStarting += (s, e) => {
            if (!IsTrusted(e.Uri)) { e.Cancel = true; OpenExternal(e.Uri); }
        };
        ConfigureExternal(core);
        if (qa) core.NavigationCompleted += (s, e) => File.AppendAllText(Path.Combine(root, "qa-trace.txt"), "Navigation: " + e.IsSuccess + " " + e.WebErrorStatus + "\n");
        var bridge = File.ReadAllText(Path.Combine(root, "bridge.js"), Encoding.UTF8);
        if (devOrigin != null) bridge = bridge.Replace("'https://toolbox.local'", json.Serialize(devOrigin.GetLeftPart(UriPartial.Authority)));
        await core.AddScriptToExecuteOnDocumentCreatedAsync(bridge);
        core.Navigate((devOrigin == null ? LocalOrigin : devOrigin.GetLeftPart(UriPartial.Authority)) + (qa ? "/tests/native-qa.html" : "/index.html"));
    }
    internal static bool ValidDevUrl(string value) {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "http" && uri.Host == "127.0.0.1" &&
            uri.Port > 0 && uri.UserInfo.Length == 0 && uri.AbsolutePath == "/" && uri.Query.Length == 0 && uri.Fragment.Length == 0;
    }
    bool IsTrusted(string value) {
        Uri uri;
        return IsLocal(value) || (devOrigin != null && Uri.TryCreate(value, UriKind.Absolute, out uri) &&
            uri.Scheme == devOrigin.Scheme && uri.Host == devOrigin.Host && uri.Port == devOrigin.Port && uri.UserInfo.Length == 0);
    }
    static bool IsLocal(string value) {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https" && uri.Host == "toolbox.local" && uri.IsDefaultPort;
    }
    internal static bool IsRemote(string value) {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || !(uri.Scheme == "http" || uri.Scheme == "https")) return false;
        return new[] { "zykj.org", "zyai.cc", "linspirer.com", "aliyuncs.com" }.Any(h => uri.Host.Equals(h, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith("." + h, StringComparison.OrdinalIgnoreCase));
    }
    static void OpenExternal(string value) {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || !(uri.Scheme == "http" || uri.Scheme == "https")) return;
        try { Process.Start(new ProcessStartInfo(value) { UseShellExecute = true }); } catch { }
    }
    void ConfigureExternal(CoreWebView2 core) {
        core.NewWindowRequested += (s, e) => { e.Handled = true; OpenExternal(e.Uri); };
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += Network;
    }
    async void Network(object sender, CoreWebView2WebResourceRequestedEventArgs e) {
        if (!IsRemote(e.Request.Uri)) return;
        // Let the browser stream media/documents and load its own page assets.
        // CORS adaptation is needed for API calls and canvas-readable images.
        if (new[] { CoreWebView2WebResourceContext.Media, CoreWebView2WebResourceContext.Document,
            CoreWebView2WebResourceContext.Script, CoreWebView2WebResourceContext.Stylesheet,
            CoreWebView2WebResourceContext.Font }.Contains(e.ResourceContext)) return;
        var defer = e.GetDeferral();
        try {
            var origin = e.Request.Headers.Contains("Origin") ? e.Request.Headers.GetHeader("Origin") : LocalOrigin;
            if (origin.Contains("\r") || origin.Contains("\n")) origin = LocalOrigin;
            var allowHeaders = e.Request.Headers.Contains("Access-Control-Request-Headers") ? e.Request.Headers.GetHeader("Access-Control-Request-Headers") : "*";
            var cors = "Access-Control-Allow-Origin: " + origin + "\r\nAccess-Control-Allow-Credentials: true\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH\r\nAccess-Control-Allow-Headers: " + allowHeaders + "\r\nAccess-Control-Expose-Headers: ETag, x-oss-request-id, x-oss-hash-crc64ecma, Content-Length, Content-Type\r\n";
            if (e.Request.Method == "OPTIONS") {
                e.Response = environment.CreateWebResourceResponse(new MemoryStream(), 204, "No Content", cors); return;
            }
            using (var request = new HttpRequestMessage(new HttpMethod(e.Request.Method), e.Request.Uri)) {
                if (e.Request.Content != null) {
                    var copy = new MemoryStream();
                    await e.Request.Content.CopyToAsync(copy);
                    request.Content = new ByteArrayContent(copy.ToArray()); copy.Dispose();
                }
                foreach (var header in e.Request.Headers) {
                    if (new[] { "Host", "Content-Length", "Origin", "Referer", "Accept-Encoding", "Connection" }.Contains(header.Key, StringComparer.OrdinalIgnoreCase)) continue;
                    if (!request.Headers.TryAddWithoutValidation(header.Key, header.Value) && request.Content != null)
                        request.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
                using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead)) {
                    // Redirects return to WebView2; every new destination is checked independently.
                    var headers = new StringBuilder(cors);
                    foreach (var h in response.Headers.Concat(response.Content.Headers)) {
                        if (h.Key.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase) ||
                            new[] { "Content-Encoding", "Content-Length", "Transfer-Encoding", "Connection" }.Contains(h.Key, StringComparer.OrdinalIgnoreCase)) continue;
                        foreach (var value in h.Value) headers.Append(h.Key).Append(": ").Append(value).Append("\r\n");
                    }
                    var bytes = await response.Content.ReadAsByteArrayAsync();
                    headers.Append("Content-Length: ").Append(bytes.Length).Append("\r\n");
                    if (!closing) e.Response = environment.CreateWebResourceResponse(new MemoryStream(bytes), (int)response.StatusCode, response.ReasonPhrase, headers.ToString());
                }
            }
        } catch {
            if (!closing) e.Response = environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("网络请求失败；请检查连接或服务器证书。")), 502, "Bad Gateway", "Content-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: " + LocalOrigin);
        } finally { try { defer.Complete(); } catch (ObjectDisposedException) { } }
    }
    static string Text(Dictionary<string, object> data, string key) { return data.ContainsKey(key) ? Convert.ToString(data[key]) : ""; }
    static double Number(Dictionary<string, object> data, string key) { return data.ContainsKey(key) ? Convert.ToDouble(data[key]) : 0; }
    async void Message(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
        if (!IsTrusted(e.Source) || !IsTrusted(main.CoreWebView2.Source)) return;
        object id = null;
        try {
            var message = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            id = message["id"];
            var args = message["args"] as Dictionary<string, object> ?? new Dictionary<string, object>();
            object result = null;
            switch (Text(message, "method")) {
                case "getDeviceId": result = DeviceId(); break;
                case "readNoteTemplate": result = Convert.ToBase64String(await Task.Run(() => ReadTemplate(Text(args, "relative")))); break;
                case "beginSave": result = BeginSave(Text(args, "filename")); break;
                case "writeSaveChunk": await Save(args).Write(Text(args, "base64"), (long)Number(args, "offset")); result = true; break;
                case "finishSave": {
                    var key = Text(args, "session"); var save = Save(args);
                    await save.Finish((long)Number(args, "size")); saves.Remove(key); result = true; break;
                }
                case "abortSave": { var key = Text(args, "session"); if (saves.ContainsKey(key)) { saves[key].Abort(); saves.Remove(key); } result = true; break; }
                case "openEmbedded": await OpenGuest(args); result = true; break;
                case "resizeEmbedded": ResizeGuest(args); result = true; break;
                case "closeEmbedded": if (Text(args, "id") == guestId) CloseGuest(); result = true; break;
                case "getEmbeddedState": result = new { loaded = guestId == Text(args, "id") && guestLoaded, error = guestId == Text(args, "id") ? guestError : "" }; break;
                case "setThemeDark": {
                    int dark = args.ContainsKey("dark") && Convert.ToBoolean(args["dark"]) ? 1 : 0;
                    DwmSetWindowAttribute(new System.Windows.Interop.WindowInteropHelper(this).Handle, 20, ref dark, 4); result = true; break;
                }
                case "qaGuestStatus": {
                    if (!qa) throw new Exception("未知方法");
                    var core = guest == null ? null : guest.CoreWebView2;
                    result = new { present = guest != null, loaded = guestLoaded,
                        bridgeDisabled = core != null && !core.Settings.IsWebMessageEnabled,
                        noPrivilegedBridge = core != null && (await core.ExecuteScriptAsync("typeof window.nativeHost === 'undefined' && typeof window.electronAPI === 'undefined'")) == "true",
                        width = guest == null ? 0 : guest.Width, height = guest == null ? 0 : guest.Height };
                    break;
                }
                case "qaTrace": if (!qa) throw new Exception("未知方法"); File.AppendAllText(Path.Combine(root, "qa-trace.txt"), Text(args, "message") + "\n"); return;
                case "qaResult": if (!qa) throw new Exception("未知方法"); WriteQa(args); Close(); return;
                default: throw new Exception("未知方法");
            }
            if (!closing) main.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { id, result }));
        } catch (Exception ex) {
            if (!closing) main.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { id, error = ex.Message }));
        }
    }
    byte[] ReadTemplate(string relative) {
        if (!AllowedTemplate(relative)) throw new Exception("不支持此笔记模板路径");
        return File.ReadAllBytes(Path.Combine(root, "dist", "example", relative.Replace('/', Path.DirectorySeparatorChar)));
    }
    internal static bool AllowedTemplate(string relative) {
        const string prefix = "a888b5fb-e65d-4611-a3af-1f80a0fb6ced/";
        return relative == "page_router.bin" || new[] { "059848e4-1971-47fb-9e47-517266cdef05_matrix.bin", "a2b4fb47-3623-45be-9fe9-57fc62e66651_file.bin",
            "e339e39b-64d9-4de0-bfaa-dace2a3f8e7d_command.bin", "header.bin", "router.bin", "screenshot.png", "snapshot.bin" }.Any(s => relative == prefix + s);
    }
    string DeviceId() {
        Directory.CreateDirectory(profile);
        var path = Path.Combine(profile, "deviceid.txt");
        if (File.Exists(path)) { Guid saved; if (Guid.TryParse(File.ReadAllText(path), out saved)) return saved.ToString(); }
        var id = Guid.NewGuid().ToString(); File.WriteAllText(path, id); return id;
    }
    string BeginSave(string filename) {
        if (saves.Count >= 4) throw new Exception("同时保存的文件过多");
        string path;
        if (qa) path = Path.Combine(root, System.Text.RegularExpressions.Regex.IsMatch(filename, "^qa-[a-z0-9-]+\\.(pdf|png)$") ? filename : "qa-saved.bin");
        else {
            var dialog = new SaveFileDialog { FileName = Path.GetFileName(filename), OverwritePrompt = true, AddExtension = false };
            if (dialog.ShowDialog(this) != true) return null;
            path = dialog.FileName;
        }
        var key = Guid.NewGuid().ToString("N"); saves.Add(key, new SaveSession(path)); return key;
    }
    SaveSession Save(Dictionary<string, object> args) {
        var key = Text(args, "session"); if (!saves.ContainsKey(key)) throw new Exception("保存会话无效"); return saves[key];
    }
    async Task OpenGuest(Dictionary<string, object> args) {
        var url = Text(args, "url"); if (!IsRemote(url)) throw new Exception("嵌入地址不属于已知服务");
        CloseGuest(); guestId = Text(args, "id"); var id = guestId;
        var view = new WebView2(); guest = view;
        guestLayer.Children.Add(view); guestLayer.IsHitTestVisible = true; ResizeGuest(args);
        await view.EnsureCoreWebView2Async(environment);
        if (closing || guest != view || guestId != id) return;
        view.CoreWebView2.Settings.IsWebMessageEnabled = false;
        view.CoreWebView2.Settings.AreHostObjectsAllowed = false;
        view.CoreWebView2.Settings.IsStatusBarEnabled = false;
        view.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
        view.CoreWebView2.Settings.AreDevToolsEnabled = false;
        ConfigureExternal(view.CoreWebView2);
        view.CoreWebView2.NavigationCompleted += (s, e) => {
            if (guest != view) return;
            guestLoaded = e.IsSuccess && e.HttpStatusCode < 400;
            guestError = !e.IsSuccess ? "官方页面加载失败（" + e.WebErrorStatus + "），请重试" : e.HttpStatusCode >= 400 ? "官方页面返回 HTTP " + e.HttpStatusCode + "，请重试" : "";
        };
        view.CoreWebView2.NavigationStarting += (s, e) => { if (!IsRemote(e.Uri) && e.Uri != "about:blank") { e.Cancel = true; OpenExternal(e.Uri); } };
        var script = Text(args, "script"); if (script.Length > 16000) throw new Exception("嵌入脚本过长");
        if (script.Length > 0) await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(script);
        if (!closing && guest == view && guestId == id) view.CoreWebView2.Navigate(url);
    }
    void ResizeGuest(Dictionary<string, object> args) {
        if (guest == null || guestId != Text(args, "id")) return;
        double scale = Number(args, "scale"); if (scale <= 0) scale = 1;
        Canvas.SetLeft(guest, Math.Max(0, Number(args, "x") * scale)); Canvas.SetTop(guest, Math.Max(0, Number(args, "y") * scale));
        guest.Width = Math.Max(1, Number(args, "width") * scale); guest.Height = Math.Max(1, Number(args, "height") * scale);
    }
    void CloseGuest() {
        guestId = null; guestLoaded = false; guestError = ""; if (guest == null) return;
        guestLayer.Children.Remove(guest); guest.Dispose(); guest = null; guestLayer.IsHitTestVisible = false;
    }
    void WriteQa(object result) { File.WriteAllText(Path.Combine(root, "qa-result.json"), json.Serialize(result), Encoding.UTF8); }
    internal static int SelfTest() {
        try {
            if (!AllowedTemplate("page_router.bin") || AllowedTemplate("../bridge.js") || AllowedTemplate("PAGE_ROUTER.bin")) throw new Exception("模板白名单失败");
            if (!IsRemote("https://sxz.api.zykj.org/api") || IsRemote("https://zykj.org.evil.test/") || IsRemote("file:///etc/passwd") || !IsLocal("https://toolbox.local/index.html") || IsLocal("https://toolbox.local.evil.test/")) throw new Exception("域名边界失败");
            if (!ValidDevUrl("http://127.0.0.1:5174/") || ValidDevUrl("http://127.0.0.1.evil.test:5174/") ||
                ValidDevUrl("https://127.0.0.1:5174/") || ValidDevUrl("http://user@127.0.0.1:5174/") || ValidDevUrl("http://127.0.0.1:5174/remote")) throw new Exception("开发地址边界失败");
            var path = Path.Combine(Path.GetTempPath(), "zytb-test-" + Guid.NewGuid().ToString("N") + ".bin");
            try {
                File.WriteAllBytes(path, new byte[] { 9 });
                var save = new SaveSession(path);
                save.Write("AQID", 0).GetAwaiter().GetResult();
                bool rejected = false; try { save.Write("BA==", 0).GetAwaiter().GetResult(); } catch { rejected = true; }
                if (!rejected) throw new Exception("乱序写入未拒绝");
                save.Finish(3).GetAwaiter().GetResult();
                if (!File.ReadAllBytes(path).SequenceEqual(new byte[] { 1, 2, 3 })) throw new Exception("保存字节错误");
                var canceled = new SaveSession(path); var temporary = canceled.Temporary; canceled.Abort();
                if (File.Exists(temporary) || !File.Exists(path)) throw new Exception("取消保存错误");
            } finally { if (File.Exists(path)) File.Delete(path); }
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test.json"), "{\"passed\":true,\"checks\":[\"template whitelist\",\"host boundary\",\"chunk offset\",\"atomic replace\",\"cancel cleanup\"]}");
            return 0;
        } catch (Exception ex) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test.json"), ex.ToString()); return 1; }
    }
}
internal sealed class SaveSession {
    readonly string destination;
    public readonly string Temporary;
    FileStream stream;
    public SaveSession(string path) {
        destination = path; Temporary = Path.Combine(Path.GetDirectoryName(path), ".zytb-" + Guid.NewGuid().ToString("N") + ".tmp");
        stream = new FileStream(Temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true);
    }
    public async Task Write(string base64, long offset) {
        if (stream == null || stream.Position != offset) throw new Exception("保存块顺序错误");
        if (base64.Length > 600000) throw new Exception("保存块过大");
        var bytes = Convert.FromBase64String(base64); await stream.WriteAsync(bytes, 0, bytes.Length);
    }
    public async Task Finish(long size) {
        if (stream == null || stream.Length != size || size <= 0) throw new Exception("保存文件长度不符");
        await stream.FlushAsync(); stream.Dispose(); stream = null;
        if (File.Exists(destination)) File.Replace(Temporary, destination, null); else File.Move(Temporary, destination);
    }
    public void Abort() {
        if (stream != null) { stream.Dispose(); stream = null; }
        if (File.Exists(Temporary)) File.Delete(Temporary);
    }
}
