import Foundation
import Network
var checks = 0
func check(_ value: @autoclosure () -> Bool, _ name: String) { precondition(value(), name); checks += 1 }
for url in ["http://sxz.api.zykj.org/api/test", "https://hagateway.zykj.org/api/discovery/sxz", "https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/test", "https://cloud.linspirer.com:883/public-interface.php"] { check(HostPolicy.remote(URL(string: url)), "Official host allowed") }
for url in ["https://zykj.org.evil.test", "https://evilzykj.org", "http://127.0.0.1:18765", "file:///etc/passwd", "https://token@zykj.org/test", "https://zykj.org:8888", "https://tbapi.loshop.com.cn/api/login"] { check(!HostPolicy.remote(URL(string: url)), "Unapproved host rejected") }
check(HostPolicy.release(URL(string:"https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases/latest"), method:"GET"), "Own public release metadata allowed")
check(!HostPolicy.release(URL(string:"https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases/latest"), method:"POST"), "Release writes rejected")
check(!HostPolicy.release(URL(string:"https://api.github.com/repos/other/private/releases/latest"), method:"GET"), "Other repositories rejected")
check(HostPolicy.release(URL(string:"https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases?per_page=20"), method:"GET"), "Own public iOS beta list allowed")
check(!HostPolicy.release(URL(string:"https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases?per_page=100"), method:"GET"), "Arbitrary GitHub queries rejected")
check(HostPolicy.release(URL(string:"https://api.github.com/repos/Loshop-Studio/ZhongYuToolBox_Web/releases?per_page=20"), method:"GET"), "Upstream public beta list allowed")
let signedOSS = URL(string:"http://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/a%20b.png?Signature=a%2Bb%2Fc%3D&Expires=100")!
check(HostPolicy.transportURL(signedOSS).absoluteString == "https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/a%20b.png?Signature=a%2Bb%2Fc%3D&Expires=100", "OSS upgrades to HTTPS without changing signed query or path")
check(HostPolicy.transportURL(URL(string:"http://ezy-sxz.oss-cn-hangzhou.aliyuncs.com:80/file")!).absoluteString == "https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/file", "HTTP default port becomes HTTPS default port")
for raw in ["http://sxz.api.zykj.org/api/test", "http://aliyuncs.com.evil.test/a", "http://token@ezy-sxz.oss-cn-hangzhou.aliyuncs.com/a", "http://ezy-sxz.oss-cn-hangzhou.aliyuncs.com:8888/a"] {
    let url = URL(string: raw)!; check(HostPolicy.transportURL(url) == url, "Only approved OSS URLs are upgraded")
}
check(HostPolicy.authorStats(URL(string:"https://tbapi.loshop.com.cn/api/login"), method:"POST"), "Original author login-count endpoint allowed separately")
for raw in ["https://tbapi.loshop.com.cn/api/login?token=x", "https://tbapi.loshop.com.cn/api/other", "https://tbapi.loshop.com.cn.evil.test/api/login"] { check(!HostPolicy.authorStats(URL(string:raw), method:"POST"), "Other author endpoints rejected") }
check(!HostPolicy.authorStats(URL(string:"https://tbapi.loshop.com.cn/api/login"), method:"GET"), "Author count endpoint requires POST")
check(HostPolicy.local(URL(string: HostPolicy.origin)), "Local origin")
check(!HostPolicy.local(URL(string: "http://127.0.0.1:18766")), "Wrong port")
check(!HostPolicy.local(URL(string: "http://localhost:18765")), "Wrong hostname")
check(!HostPolicy.sameOrigin(URL(string: "https://sxz.api.zykj.org"), URL(string: "http://sxz.api.zykj.org")), "Scheme downgrade is not same-origin")
check(HostPolicy.sameOrigin(URL(string: "https://sxz.api.zykj.org"), URL(string: "https://sxz.api.zykj.org:443")), "Default port")
let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: root) }
for path in ["/../secrets", "/%2e%2e/secrets", "/%00secret", "/a\\b"] { check(HostPolicy.asset(path, root: root) == nil, "Path traversal blocked") }
check(HostPolicy.asset("/assets/worker.mjs", root: root)?.lastPathComponent == "worker.mjs", "Worker asset")
check(HostPolicy.filename("../../notes.pdf") == ".._.._notes.pdf", "Sanitize filename")
let bytes = Data((0..<600_000).map { UInt8($0 % 251) })
try bytes.write(to: root.appendingPathComponent("test.bin"))
try Data("export const test = true".utf8).write(to: root.appendingPathComponent("worker.mjs"))
let cache = root.appendingPathComponent("cache", isDirectory: true)
try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
// Reserve the preferred port with another real listener to reproduce EADDRINUSE.
let blockerParams = NWParameters.tcp
blockerParams.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: 18765)!)
let blocker = try NWListener(using: blockerParams)
let occupied = DispatchSemaphore(value: 0)
blocker.stateUpdateHandler = { state in if case .ready = state { occupied.signal() } }
blocker.newConnectionHandler = { $0.cancel() }
blocker.start(queue: DispatchQueue(label: "test.occupied"))
check(occupied.wait(timeout: .now() + 10) == .success, "Preferred port really occupied")
defer { blocker.cancel() }
let server = LocalAssetServer(root: root, cache: cache, preferredPort: 18765, persistPort: false)
let ready = DispatchSemaphore(value: 0)
var startError: Error?
server.start { result in if case .failure(let error) = result { startError = error }; ready.signal() }
let startDeadline = Date().addingTimeInterval(15)
var didStart = false
while Date() < startDeadline {
    if ready.wait(timeout: .now()) == .success { didStart = true; break }
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
}
if let startError { print("Listener error: \(startError)") }
check(didStart && startError == nil, "Loopback server starts")
check(HostPolicy.port != 18765, "Occupied port falls back to an OS-assigned free port")
check(!HostPolicy.local(URL(string: "http://127.0.0.1:18765")), "Occupied old port cannot invoke privileged bridge")
var duplicateURLs = [URL](); let duplicate = DispatchSemaphore(value: 0)
for _ in 0..<3 { server.start { result in if case .success(let url) = result { duplicateURLs.append(url) }; duplicate.signal() } }
for _ in 0..<3 { check(duplicate.wait(timeout: .now() + 5) == .success, "Repeated start completes") }
check(duplicateURLs.count == 3 && Set(duplicateURLs).count == 1 && duplicateURLs[0].absoluteString == HostPolicy.origin + "/", "Repeated starts reuse the same listener and origin")
func request(_ path: String, host: String? = nil) -> (Data, HTTPURLResponse) {
    var req = URLRequest(url: URL(string: HostPolicy.origin + path)!)
    if let host { req.setValue(host, forHTTPHeaderField: "Host") }
    let done = DispatchSemaphore(value: 0); var result: Data?, response: HTTPURLResponse?, failure: Error?
    URLSession.shared.dataTask(with: req) { data, http, error in result = data; response = http as? HTTPURLResponse; failure = error; done.signal() }.resume()
    check(done.wait(timeout: .now() + 10) == .success && failure == nil, "Local request completes")
    return (result!, response!)
}
let file = request("/test.bin"); check(file.0 == bytes && file.1.statusCode == 200, "600 KB streamed binary unchanged")
check(file.1.value(forHTTPHeaderField: "Access-Control-Allow-Origin") == nil, "App assets remain same-origin")
let responseName = UUID().uuidString + ".bin"
try bytes.write(to: cache.appendingPathComponent(responseName))
let bridged = request("/native-response/" + responseName)
check(bridged.0 == bytes && bridged.1.value(forHTTPHeaderField: "Access-Control-Allow-Origin") == "*", "Guest can read its native response")
let worker = request("/worker.mjs"); check(worker.1.value(forHTTPHeaderField: "Content-Type") == "text/javascript", "Module worker MIME")
check(request("/missing").1.statusCode == 404, "Missing file status")
check(request("/%2e%2e/secrets").1.statusCode == 404, "HTTP traversal rejected")
check(request("/test.bin", host: "evil.test").1.statusCode == 403, "DNS rebinding rejected")
check(request("/native-response/nope.bin").1.statusCode == 404, "Response UUID restriction")
print("PASS: \(checks) Swift host-policy / actual loopback asset server checks")
