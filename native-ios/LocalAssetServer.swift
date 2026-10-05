import Foundation
import Network
import UniformTypeIdentifiers

/// Prefer a persistent loopback origin; recover if another process holds that port.
/// This serves files only; remote networking remains in the origin-scoped message bridge.
final class LocalAssetServer {
    let root: URL, cache: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "aoki.assets", qos: .userInitiated)
    private var pending: [(Result<URL, Error>) -> Void] = []
    private var readyURL: URL?, generation = 0, starting = false
    private let preferredPort: UInt16, persistPort: Bool
    private static var sharedInstance: LocalAssetServer?
    // All UIWindowScenes use one server and one cache. Creating a second controller
    // must neither bind the port again nor delete files from an active transfer.
    static func shared(root: URL, cache: URL) throws -> LocalAssetServer {
        if let sharedInstance { return sharedInstance }
        try? FileManager.default.removeItem(at: cache)
        try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
        let value = LocalAssetServer(root: root, cache: cache)
        sharedInstance = value; return value
    }
    init(root: URL, cache: URL, preferredPort: UInt16? = nil, persistPort: Bool = true) {
        self.root = root; self.cache = cache; self.persistPort = persistPort
        let saved = UserDefaults.standard.integer(forKey: "assetServerPort")
        self.preferredPort = preferredPort ?? (saved > 1024 && saved <= 65535 ? UInt16(saved) : 18765)
    }
    func start(_ completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async {
            if let url = self.readyURL { completion(.success(url)); return }
            self.pending.append(completion)
            if !self.starting { self.starting = true; self.bind(self.preferredPort, retries: 1) }
        }
    }
    private func finish(_ result: Result<URL, Error>) {
        starting = false
        let callbacks = pending; pending.removeAll()
        for callback in callbacks { callback(result) }
    }
    private func bind(_ port: UInt16, retries: Int) {
        generation += 1; let attempt = generation
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self, let listener, self.generation == attempt else { return }
                switch state {
                case .ready:
                    guard let bound = listener.port else { self.finish(.failure(HostFailure.message("本地服务未取得监听端口"))); return }
                    HostPolicy.useLocalPort(bound.rawValue)
                    if self.persistPort { UserDefaults.standard.set(Int(bound.rawValue), forKey: "assetServerPort") }
                    self.readyURL = URL(string: HostPolicy.origin + "/")!
                    self.finish(.success(self.readyURL!))
                case .failed(let error), .waiting(let error):
                    guard self.readyURL == nil else { return }
                    self.bindingFailed(error, port: port, retries: retries)
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                connection.start(queue: self?.queue ?? DispatchQueue.global())
                self?.receive(connection, buffer: Data())
            }
            listener.start(queue: queue)
            queue.asyncAfter(deadline: .now() + 10) { [weak self] in
                guard let self, self.generation == attempt, self.readyURL == nil else { return }
                self.listener?.cancel(); self.listener = nil; self.generation += 1
                self.finish(.failure(HostFailure.message("本地界面服务启动超时，请重新打开应用")))
            }
        } catch { bindingFailed(error, port: port, retries: retries) }
    }
    private func bindingFailed(_ error: Error, port: UInt16, retries: Int) {
        listener?.cancel(); listener = nil; generation += 1
        if let networkError = error as? NWError, case .posix(.EADDRINUSE) = networkError, port != 0 {
            // Give the previous process a chance to release its socket; otherwise
            // ask the OS for an unused port, never load the other app's page.
            queue.asyncAfter(deadline: .now() + 0.3) { self.bind(retries > 0 ? port : 0, retries: max(0, retries - 1)) }
        } else { finish(.failure(error)) }
    }
    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] bytes, _, ended, error in
            guard let self else { connection.cancel(); return }
            var data = buffer; if let bytes { data.append(bytes) }
            if data.count > 32 * 1024 { self.reject(connection, 431); return }
            if data.range(of: Data("\r\n\r\n".utf8)) != nil { self.serve(connection, data: data); return }
            if ended || error != nil { connection.cancel(); return }
            self.receive(connection, buffer: data)
        }
    }
    private func reject(_ connection: NWConnection, _ code: Int) {
        let data = Data("HTTP/1.1 \(code) Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
    }
    private func serve(_ connection: NWConnection, data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { reject(connection, 400); return }
        let lines = text.components(separatedBy: "\r\n"), first = lines[0].split(separator: " ")
        guard first.count == 3, ["GET", "HEAD"].contains(String(first[0])), lines.contains(where: { $0.lowercased() == "host: 127.0.0.1:\(HostPolicy.port)" }) else { reject(connection, 403); return }
        let path = String(first[1]).components(separatedBy: "?")[0]
        let response = path.hasPrefix("/native-response/")
        var file: URL?
        if response {
            let name = String(path.dropFirst("/native-response/".count))
            if UUID(uuidString: String(name.dropLast(4))) != nil && name.hasSuffix(".bin") { file = cache.appendingPathComponent(name) }
        } else { file = HostPolicy.asset(path, root: root) }
        guard let file, let handle = try? FileHandle(forReadingFrom: file), let size = try? handle.seekToEnd() else { reject(connection, 404); return }
        try? handle.seek(toOffset: 0)
        let mime: String
        switch file.pathExtension.lowercased() {
        case "js", "mjs": mime = "text/javascript"
        case "wasm": mime = "application/wasm"
        default: mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        }
        // Embedded official pages read their own opaque, single-use response URL.
        // Static app assets do not become cross-origin readable.
        let cors = response ? "Access-Control-Allow-Origin: *\r\n" : ""
        let headers = Data("HTTP/1.1 200 OK\r\nContent-Type: \(mime)\r\nContent-Length: \(size)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\(cors)Connection: close\r\n\r\n".utf8)
        connection.send(content: headers, completion: .contentProcessed { [weak self] error in
            if error != nil || first[0] == "HEAD" { try? handle.close(); connection.cancel(); return }
            self?.sendFile(handle, connection: connection, cleanup: response ? file : nil)
        })
    }
    private func sendFile(_ file: FileHandle, connection: NWConnection, cleanup: URL?) {
        guard let chunk = try? file.read(upToCount: 256 * 1024), !chunk.isEmpty else {
            try? file.close()
            connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in connection.cancel() })
            if let cleanup { try? FileManager.default.removeItem(at: cleanup) }
            return
        }
        connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
            if error != nil { try? file.close(); connection.cancel(); if let cleanup { try? FileManager.default.removeItem(at: cleanup) }; return }
            self?.sendFile(file, connection: connection, cleanup: cleanup)
        })
    }
    deinit { listener?.cancel() }
}
