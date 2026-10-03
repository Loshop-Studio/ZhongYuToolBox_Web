import Foundation

enum HostPolicy {
    static let port = 18765
    static let origin = "http://127.0.0.1:\(port)"
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
    static func release(_ url: URL?, method: String) -> Bool {
        guard let url else { return false }
        return method == "GET" && url.scheme == "https" && url.host == "api.github.com" && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil && url.query == nil && url.fragment == nil && ["/repos/nickfox395/ZhongYuToolBox_Web/releases/latest", "/repos/Loshop-Studio/ZhongYuToolBox_Web/releases/latest"].contains(url.path)
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
