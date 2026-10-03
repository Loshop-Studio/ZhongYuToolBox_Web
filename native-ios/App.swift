import UIKit
import WebKit
import UniformTypeIdentifiers

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Toolbox", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        let controller = ToolboxController()
        let navigation = UINavigationController(rootViewController: controller)
        navigation.navigationBar.prefersLargeTitles = false
        navigation.setToolbarHidden(false, animated: false)
        window.rootViewController = navigation; self.window = window; window.makeKeyAndVisible()
    }
}

/// UIKit owns navigation / toolbar / document panels so iOS 26 provides real Liquid Glass.
/// The web content retains aoki's original UI and account-scoped workflows.
final class ToolboxController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, UIDocumentPickerDelegate {
    private var main: WKWebView!, guest: WKWebView?
    private var server: LocalAssetServer!, transport: NativeTransport!, bridge = ""
    private var guestID = "", guestLoaded = false, guestError = "", route = "/login"
    private var saveReply: ((Any?, String?) -> Void)?, saveURL: URL?
    private var openReply: (([URL]?) -> Void)?
    private var importedFiles: [URL] = []
    private let status = UILabel()
    private var systemDark: Bool { UIScreen.main.traitCollection.userInterfaceStyle == .dark }
    private let items: [(String, String, String)] = [
        ("云笔记", "doc.text", "/note"), ("新测评", "square.and.pencil", "/exam"),
        ("错题本", "book.closed", "/mistake"), ("图库", "photo.on.rectangle", "/picture")
    ]
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "中育工具箱"; view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(back))
        navigationItem.leftBarButtonItem?.accessibilityLabel = "返回"
        navigationItem.rightBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: menu())
        navigationItem.rightBarButtonItem?.accessibilityLabel = "更多工具与外观设置"
        var controls: [UIBarButtonItem] = []
        for (index, item) in items.enumerated() {
            if index > 0 { controls.append(UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)) }
            let button = UIBarButtonItem(image: UIImage(systemName: item.1), style: .plain, target: self, action: #selector(tool(_:)))
            button.tag = index; button.accessibilityLabel = item.0; controls.append(button)
        }
        toolbarItems = controls
        // Do not install an opaque bar background; UIKit applies Liquid Glass on iOS 26.
        navigationController?.navigationBar.tintColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.80, green: 0.70, blue: 0.83, alpha: 1) : UIColor(red: 0.44, green: 0.34, blue: 0.46, alpha: 1) }
        navigationController?.toolbar.tintColor = navigationController?.navigationBar.tintColor
        status.text = "正在启动中育工具箱…"; status.textAlignment = .center; status.numberOfLines = 0
        status.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(status)
        NSLayoutConstraint.activate([status.centerXAnchor.constraint(equalTo: view.centerXAnchor), status.centerYAnchor.constraint(equalTo: view.centerYAnchor), status.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -36)])
        do {
            guard let web = Bundle.main.url(forResource: "WebAssets", withExtension: nil), let bridgeURL = Bundle.main.url(forResource: "bridge", withExtension: "js") else { throw HostFailure.message("应用资源缺失，请重新安装完整 IPA") }
            bridge = try String(contentsOf: bridgeURL, encoding: .utf8)
            let cache = FileManager.default.temporaryDirectory.appendingPathComponent("zytb-ios-transport", isDirectory: true)
            // Only our own transient files are removed; WKWebsiteDataStore holds login/settings separately.
            try? FileManager.default.removeItem(at: cache)
            try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
            transport = NativeTransport(cache: cache); server = LocalAssetServer(root: web, cache: cache)
            main = makeWebView(privileged: true)
            main.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(main)
            NSLayoutConstraint.activate([main.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor), main.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor), main.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), main.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
            server.start { [weak self] result in DispatchQueue.main.async {
                guard let self else { return }
                switch result { case .success(let url): self.main.load(URLRequest(url: url)); case .failure(let error): self.main.isHidden = true; self.status.text = "本地界面启动失败：\(error.localizedDescription)" }
            } }
        } catch { status.text = error.localizedDescription }
    }
    private func makeWebView(privileged: Bool, script: String = "") -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = privileged ? .default() : .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "zytb")
        config.userContentController.addUserScript(WKUserScript(source: bridge + "\n" + script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isOpaque = false; web.backgroundColor = .clear; web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        return web
    }
    private func navigate(_ path: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: [path]), let encoded = String(data: data, encoding: .utf8) else { return }
        main?.evaluateJavaScript("window.__zytbNavigate && window.__zytbNavigate(\(encoded)[0])", completionHandler: nil)
    }
    @objc private func tool(_ item: UIBarButtonItem) { navigate(items[item.tag].2) }
    @objc private func back() {
        if let guest, guest.canGoBack { guest.goBack() }
        else { main?.evaluateJavaScript("window.__zytbBack && window.__zytbBack()", completionHandler: nil) }
    }
    private func menu() -> UIMenu {
        let tools = [("用户中心", "person.crop.circle", "/login"), ("在线专栏", "newspaper", "/column"), ("选课", "graduationcap", "/course"), ("优客畅学", "play.rectangle", "/lesson"), ("随身答", "bubble.left.and.bubble.right", "/quora"), ("领创", "square.stack", "/linspirer"), ("中育应用下载", "arrow.down.circle", "/apps"), ("高级选项", "gearshape", "/advance"), ("分享", "square.and.arrow.up", "/share"), ("支持作者", "heart", "/donate"), ("关于与致谢", "info.circle", "/about")]
        let actions = tools.map { name, icon, path in UIAction(title: name, image: UIImage(systemName: icon)) { [weak self] _ in self?.navigate(path) } }
        let appearance = [("浅色", "light"), ("深色", "dark"), ("跟随系统", "system")].map { label, mode in
            UIAction(title: label) { [weak self] _ in self?.main?.evaluateJavaScript("window.__zytbSetThemeMode && window.__zytbSetThemeMode('\(mode)')", completionHandler: nil) }
        }
        return UIMenu(children: [UIMenu(title: "学习工具", options: .displayInline, children: actions), UIMenu(title: "外观", children: appearance)])
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        let privileged = message.webView === main && message.frameInfo.isMainFrame && HostPolicy.local(message.frameInfo.request.url)
        let networkOnly = message.webView === guest && message.frameInfo.isMainFrame && HostPolicy.remote(message.frameInfo.request.url)
        guard privileged || networkOnly, let body = message.body as? [String: Any], let method = body["method"] as? String else { replyHandler(nil, "此页面没有原生权限"); return }
        let args = body["args"] as? [String: Any] ?? [:]
        let reply: (Any?, String?) -> Void = { value, error in DispatchQueue.main.async { replyHandler(value, error) } }
        let network = Set(["beginRequest", "writeRequest", "request", "cancelRequest"])
        guard privileged || network.contains(method) else { reply(nil, "远端页面不能访问文件、设备或窗口"); return }
        if network.contains(method) || ["beginSave", "writeSaveChunk", "abortSave"].contains(method) { transport.handle(method, args, reply: reply); return }
        switch method {
        case "getEnvironment": reply(["systemDark": systemDark], nil)
        case "getDeviceId": reply(UIDevice.current.identifierForVendor?.uuidString ?? "", nil)
        case "syncNavigation":
            route = args["path"] as? String ?? "/login"; title = args["title"] as? String ?? "中育工具箱"
            navigationItem.leftBarButtonItem?.isEnabled = route != "/login"
            reply(true, nil)
        case "setThemeDark":
            let mode = args["mode"] as? String ?? "system"
            navigationController?.overrideUserInterfaceStyle = mode == "system" ? .unspecified : (mode == "dark" ? .dark : .light)
            reply(true, nil)
        case "openExternal":
            guard let value = args["url"] as? String, let url = URL(string: value), HostPolicy.external(url) else { reply(nil, "不支持的外部链接"); return }
            UIApplication.shared.open(url); reply(true, nil)
        case "openEmbedded":
            guard let value = args["url"] as? String, let url = URL(string: value), HostPolicy.remote(url), let id = args["id"] as? String else { reply(nil, "不支持的内嵌页面地址"); return }
            closeGuest(); guestID = id; guestLoaded = false; guestError = ""
            guest = makeWebView(privileged: false, script: args["script"] as? String ?? "")
            view.addSubview(guest!); resizeGuest(args); guest?.load(URLRequest(url: url)); reply(true, nil)
        case "resizeEmbedded": if guestID == (args["id"] as? String) { resizeGuest(args) }; reply(true, nil)
        case "closeEmbedded": if guestID == (args["id"] as? String) { closeGuest() }; reply(true, nil)
        case "getEmbeddedState":
            let matches = guestID == (args["id"] as? String)
            reply(["loaded": matches && guestLoaded, "error": matches ? guestError : ""], nil)
        case "finishSave":
            guard saveReply == nil, presentedViewController == nil else { reply(nil, "请先完成当前文件操作"); return }
            saveReply = reply
            transport.takeSave(args) { [weak self] result in DispatchQueue.main.async {
                guard let self else { reply(nil, "页面已关闭"); return }
                switch result {
                case .failure(let error): self.saveReply = nil; reply(nil, error.localizedDescription)
                case .success(let stage):
                    self.saveURL = stage.url
                    let picker = UIDocumentPickerViewController(forExporting: [stage.url], asCopy: true)
                    picker.delegate = self; self.present(picker, animated: true)
                }
            } }
        default: reply(nil, "未知原生操作")
        }
    }
    private func resizeGuest(_ args: [String: Any]) {
        guard let guest, let main else { return }
        func number(_ key: String, _ fallback: Double = 0) -> CGFloat { let value = (args[key] as? NSNumber)?.doubleValue ?? fallback; return value.isFinite ? CGFloat(value) : CGFloat(fallback) }
        let origin = main.frame.origin
        guest.frame = CGRect(x: origin.x + number("x"), y: origin.y + number("y"), width: max(1, min(main.bounds.width, number("width", 1))), height: max(1, min(main.bounds.height, number("height", 1))))
    }
    private func closeGuest() {
        guest?.stopLoading(); guest?.configuration.userContentController.removeScriptMessageHandler(forName: "zytb", contentWorld: .page)
        guest?.removeFromSuperview(); guest = nil; guestID = ""; guestLoaded = false; guestError = ""
    }
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        main?.evaluateJavaScript("window.__zytbSetSystemDark && window.__zytbSetSystemDark(\(systemDark))", completionHandler: nil)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if webView === main && HostPolicy.local(url) || webView === guest && HostPolicy.remote(url) { decisionHandler(.allow); return }
        if HostPolicy.external(url) { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { if webView === guest { guestLoaded = false; guestError = "" } }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === guest { guestLoaded = guestError.isEmpty }
        else { status.isHidden = true }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === guest { guestError = "页面进程已退出，请重新加载"; guestLoaded = false }
        else { webView.reload() }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(webView, error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(webView, error) }
    private func failed(_ web: WKWebView, _ error: Error) {
        if web === guest { guestError = error.localizedDescription; guestLoaded = false }
        else { main.isHidden = true; status.isHidden = false; status.text = "界面加载失败：\(error.localizedDescription)" }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if webView === guest, response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 400 { guestError = "服务器返回 HTTP \(http.statusCode)"; guestLoaded = false }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, HostPolicy.external(url) { UIApplication.shared.open(url) }; return nil
    }
    // WebKit's built-in picker is used on iOS 16–18.3. Newer systems permit explicit multi-file document panels.
    @available(iOS 18.4, *)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard webView === main, frame.isMainFrame, HostPolicy.local(frame.request.url), openReply == nil, presentedViewController == nil else { completionHandler(nil); return }
        openReply = completionHandler
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.allowsMultipleSelection = parameters.allowsMultipleSelection; picker.delegate = self; present(picker, animated: true)
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        if let openReply { self.openReply = nil; importedFiles += urls; openReply(urls); return }
        finishSave(canceled: false)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if let openReply { self.openReply = nil; openReply(nil); return }; finishSave(canceled: true)
    }
    private func finishSave(canceled: Bool) {
        let reply = saveReply; saveReply = nil; reply?(["canceled": canceled], nil)
        if let saveURL { try? FileManager.default.removeItem(at: saveURL.deletingLastPathComponent()); self.saveURL = nil }
    }
}
