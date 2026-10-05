import Foundation

enum HostPolicy {
    static private(set) var port = 18765
    static var origin: String { "http://127.0.0.1:\(port)" }
    // Pin privileges to the port actually bound by our listener, never every loopback port.
    static func useLocalPort(_ value: UInt16) { port = Int(value) }
    static let maxFileSize = 128 * 1024 * 1024
    static let maxChunkSize = 192 * 1024
    static let methods = Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    static func local(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == port && url.user == nil && url.password == nil
    }
    static func remote(_ url: URL?) -> Bool {
        guard let url, let host = url.host?.lowercased(), ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil else { return false }
        for suffix in ["zykj.org", "zyai.cc", "linspirer.com", "aliyuncs.com"] {
            if host == suffix || host.hasSuffix("." + suffix) {
                return url.port == nil || [80, 443].contains(url.port!) || (suffix == "linspirer.com" && url.port == 883)
            }
        }
        return false
    }
    // Legacy OSS links may be HTTP. OSS supports HTTPS; keep the signed query intact.
    static func transportURL(_ url: URL) -> URL {
        guard remote(url), url.scheme == "http", let host = url.host?.lowercased(),
              host.hasSuffix(".aliyuncs.com"), url.port == nil || url.port == 80,
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        parts.scheme = "https"; parts.port = nil
        return parts.url ?? url
    }
    static func authorStats(_ url: URL?, method: String) -> Bool {
        guard let url else { return false }
        return method == "POST" && url.scheme == "https" && url.host == "tbapi.loshop.com.cn"
            && (url.port == nil || url.port == 443) && url.path == "/api/login"
            && url.query == nil && url.fragment == nil && url.user == nil && url.password == nil
    }
    static func release(_ url: URL?, method: String) -> Bool {
        guard let url else { return false }
        let stable = url.query == nil && ["/repos/nickfox395/ZhongYuToolBox_Web/releases/latest", "/repos/Loshop-Studio/ZhongYuToolBox_Web/releases/latest"].contains(url.path)
        let iosBeta = ["/repos/nickfox395/ZhongYuToolBox_Web/releases", "/repos/Loshop-Studio/ZhongYuToolBox_Web/releases"].contains(url.path) && url.query == "per_page=20"
        return method == "GET" && url.scheme == "https" && url.host == "api.github.com" && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil && url.fragment == nil && (stable || iosBeta)
    }
    static func external(_ url: URL?) -> Bool {
        guard let url else { return false }
        return ["http", "https"].contains(url.scheme ?? "") && url.user == nil && url.password == nil && !local(url)
    }
    static func sameOrigin(_ a: URL?, _ b: URL?) -> Bool {
        guard let a, let b else { return false }
        func port(_ u: URL) -> Int { u.port ?? (u.scheme == "https" ? 443 : 80) }
        return a.scheme == b.scheme && a.host?.lowercased() == b.host?.lowercased() && port(a) == port(b)
    }
    static func asset(_ rawPath: String, root: URL) -> URL? {
        guard let path = rawPath.removingPercentEncoding, !path.contains("\0"), !path.contains("\\"), !path.split(separator: "/").contains("..") else { return nil }
        let target = root.appendingPathComponent(path == "/" ? "index.html" : String(path.drop(while: { $0 == "/" }))).standardizedFileURL.resolvingSymlinksInPath()
        let base = root.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        return target.path.hasPrefix(base) ? target : nil
    }
    static func filename(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:*?\"<>|\r\n\0")
        let name = value.components(separatedBy: invalid).joined(separator: "_").prefix(180)
        return name.isEmpty || name == "." || name == ".." ? "下载文件.bin" : String(name)
    }
}

enum HostFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}
