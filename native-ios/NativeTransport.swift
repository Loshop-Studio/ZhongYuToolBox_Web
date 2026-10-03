import Foundation

/// All stages and delegate callbacks share one queue. Bodies stay in temporary files.
final class NativeTransport: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    struct Stage { let url: URL, name: String, created: Date }
    final class Transfer {
        let id: String, output: URL, file: FileHandle, reply: (Any?, String?) -> Void
        var response: HTTPURLResponse?, bytes = 0, failure: String?
        init(id: String, output: URL, file: FileHandle, reply: @escaping (Any?, String?) -> Void) {
            self.id = id; self.output = output; self.file = file; self.reply = reply
        }
    }
    let cache: URL
    private let queue = DispatchQueue(label: "aoki.network", qos: .userInitiated)
    private var stages: [String: Stage] = [:], transfers: [Int: Transfer] = [:], tasks: [String: URLSessionTask] = [:]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 120; config.timeoutIntervalForResource = 300
        config.urlCache = nil
        let delegates = OperationQueue(); delegates.maxConcurrentOperationCount = 1; delegates.underlyingQueue = queue
        return URLSession(configuration: config, delegate: self, delegateQueue: delegates)
    }()
    init(cache: URL) { self.cache = cache; super.init() }
    func handle(_ method: String, _ args: [String: Any], privileged: Bool = false, reply: @escaping (Any?, String?) -> Void) {
        queue.async {
            do {
                switch method {
                case "beginRequest", "beginSave":
                    let expired = self.stages.filter { Date().timeIntervalSince($0.value.created) > 600 && self.tasks[$0.key] == nil }
                    for (id, stage) in expired { self.stages.removeValue(forKey: id); try? FileManager.default.removeItem(at: stage.url) }
                    guard self.stages.count < 12 else { throw HostFailure.message("待处理文件过多，请稍后重试") }
                    let id = UUID().uuidString, file = self.cache.appendingPathComponent(id + ".part")
                    try Data().write(to: file)
                    self.stages[id] = Stage(url: file, name: HostPolicy.filename(args["filename"] as? String ?? "下载文件.bin"), created: Date())
                    reply(id, nil)
                case "writeRequest", "writeSaveChunk":
                    let id = args["session"] as? String ?? ""
                    guard self.tasks[id] == nil, let stage = self.stages[id], let offset = args["offset"] as? NSNumber,
                          let encoded = args["base64"] as? String, let bytes = Data(base64Encoded: encoded), bytes.count <= HostPolicy.maxChunkSize else { throw HostFailure.message("文件会话或数据块无效") }
                    let file = try FileHandle(forWritingTo: stage.url); defer { try? file.close() }
                    let actual = try file.seekToEnd()
                    guard offset.doubleValue.isFinite, offset.doubleValue == Double(actual), actual + UInt64(bytes.count) <= UInt64(HostPolicy.maxFileSize) else { throw HostFailure.message("文件块顺序错误或文件超过 128 MB") }
                    try file.write(contentsOf: bytes); reply(true, nil)
                case "cancelRequest", "abortSave":
                    let id = args["session"] as? String ?? ""
                    self.tasks[id]?.cancel()
                    if let stage = self.stages.removeValue(forKey: id) { try? FileManager.default.removeItem(at: stage.url) }
                    reply(true, nil)
                case "request": try self.request(args, privileged: privileged, reply: reply)
                default: throw HostFailure.message("未知网络操作")
                }
            } catch { reply(nil, error.localizedDescription) }
        }
    }
    func takeSave(_ args: [String: Any], completion: @escaping (Result<Stage, Error>) -> Void) {
        queue.async {
            do {
                let id = args["session"] as? String ?? ""
                guard let stage = self.stages[id], let expected = args["size"] as? NSNumber else { throw HostFailure.message("保存会话无效") }
                let size = try FileManager.default.attributesOfItem(atPath: stage.url.path)[.size] as? NSNumber
                guard size?.uint64Value == expected.uint64Value else { throw HostFailure.message("保存文件长度不一致") }
                self.stages.removeValue(forKey: id)
                let directory = self.cache.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let destination = directory.appendingPathComponent(stage.name)
                try FileManager.default.moveItem(at: stage.url, to: destination)
                completion(.success(Stage(url: destination, name: stage.name, created: stage.created)))
            } catch { completion(.failure(error)) }
        }
    }
    private func request(_ args: [String: Any], privileged: Bool, reply: @escaping (Any?, String?) -> Void) throws {
        let id = args["session"] as? String ?? "", method = (args["method"] as? String ?? "GET").uppercased()
        guard let stage = stages[id], tasks[id] == nil, let value = args["url"] as? String, let url = URL(string: value), (HostPolicy.remote(url) || (privileged && HostPolicy.release(url, method: method))), HostPolicy.methods.contains(method) else { throw HostFailure.message("请求地址、方法或会话未获允许") }
        var request = URLRequest(url: url); request.httpMethod = method
        let forbidden = Set(["host", "origin", "referer", "connection", "content-length", "accept-encoding", "cookie"])
        for (key, value) in args["headers"] as? [String: String] ?? [:] where !forbidden.contains(key.lowercased()) { request.setValue(value, forHTTPHeaderField: key) }
        let output = cache.appendingPathComponent(UUID().uuidString + ".bin")
        try Data().write(to: output)
        let file = try FileHandle(forWritingTo: output)
        let bodySize = (try FileManager.default.attributesOfItem(atPath: stage.url.path)[.size] as? NSNumber)?.intValue ?? 0
        let task: URLSessionTask = bodySize > 0 && !["GET", "HEAD"].contains(method)
            ? session.uploadTask(with: request, fromFile: stage.url) : session.dataTask(with: request)
        transfers[task.taskIdentifier] = Transfer(id: id, output: output, file: file, reply: reply)
        tasks[id] = task; task.resume()
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let transfer = transfers[dataTask.taskIdentifier], let response = response as? HTTPURLResponse else { completionHandler(.cancel); return }
        transfer.response = response
        if response.expectedContentLength > 256 * 1024 * 1024 { transfer.failure = "返回文件超过 256 MB"; completionHandler(.cancel) }
        else { completionHandler(.allow) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let transfer = transfers[dataTask.taskIdentifier] else { return }
        transfer.bytes += data.count
        do {
            guard transfer.bytes <= 256 * 1024 * 1024 else { throw HostFailure.message("返回文件超过 256 MB") }
            try transfer.file.write(contentsOf: data)
        } catch { transfer.failure = error.localizedDescription; dataTask.cancel() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let transfer = transfers.removeValue(forKey: task.taskIdentifier) else { return }
        try? transfer.file.close(); tasks.removeValue(forKey: transfer.id)
        if let stage = stages.removeValue(forKey: transfer.id) { try? FileManager.default.removeItem(at: stage.url) }
        if let failure = transfer.failure ?? error?.localizedDescription {
            try? FileManager.default.removeItem(at: transfer.output); transfer.reply(nil, failure); return
        }
        guard let response = transfer.response else { try? FileManager.default.removeItem(at: transfer.output); transfer.reply(nil, "服务器未返回响应"); return }
        var headers: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            let name = String(describing: key)
            if !["content-encoding", "transfer-encoding", "set-cookie", "content-length"].contains(name.lowercased()) { headers[name] = String(describing: value) }
        }
        headers["Content-Length"] = String(transfer.bytes)
        transfer.reply(["status": response.statusCode, "statusText": "", "headers": headers, "bodyUrl": HostPolicy.origin + "/native-response/" + transfer.output.lastPathComponent], nil)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard HostPolicy.remote(request.url) else { transfers[task.taskIdentifier]?.failure = "服务器重定向地址未获允许"; completionHandler(nil); return }
        var safe = request
        if !HostPolicy.sameOrigin(response.url, request.url) {
            for key in ["Authorization", "Cookie", "x-oss-security-token"] { safe.setValue(nil, forHTTPHeaderField: key) }
        }
        completionHandler(safe)
    }
}
