import Foundation
import Network
import UniformTypeIdentifiers

/// A fixed loopback origin preserves WKWebsiteDataStore/localStorage across launches.
/// This serves files only; remote networking remains in the origin-scoped message bridge.
final class LocalAssetServer {
    let root: URL, cache: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "aoki.assets", qos: .userInitiated)
    init(root: URL, cache: URL) { self.root = root; self.cache = cache }
    func start(_ completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: UInt16(HostPolicy.port))!)
            let listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: UInt16(HostPolicy.port))!)
            self.listener = listener
            var replied = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: if !replied { replied = true; completion(.success(URL(string: HostPolicy.origin + "/")!)) }
                case .failed(let error): if !replied { replied = true; completion(.failure(error)) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                connection.start(queue: self?.queue ?? DispatchQueue.global())
                self?.receive(connection, buffer: Data())
            }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
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
