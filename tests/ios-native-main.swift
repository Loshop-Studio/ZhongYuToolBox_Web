import Foundation
import Network
var checks = 0
func check(_ value: @autoclosure () -> Bool, _ name: String) { precondition(value(), name); checks += 1 }
for url in ["http://sxz.api.zykj.org/api/test", "https://hagateway.zykj.org/api/discovery/sxz", "https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/test", "https://cloud.linspirer.com:883/public-interface.php"] { check(HostPolicy.remote(URL(string: url)), "Official host allowed") }
for url in ["https://zykj.org.evil.test", "https://evilzykj.org", "http://127.0.0.1:18765", "file:///etc/passwd", "https://token@zykj.org/test", "https://zykj.org:8888", "https://tbapi.loshop.com.cn/api/login"] { check(!HostPolicy.remote(URL(string: url)), "Unapproved host rejected") }
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
let server = LocalAssetServer(root: root, cache: cache)
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
