import Foundation
import WebKit

/// Images do not use fetch/XHR. Serve approved official images through URLSession too.
/// No Referer, Origin, Cookie or account credentials are sent; redirects stay on approved hosts.
final class ImageSchemeHandler: NSObject, WKURLSchemeHandler, URLSessionDataDelegate {
    static let scheme = "zytb-image"
    var testProtocols: [AnyClass] = []
    private struct Transfer { let web: WKURLSchemeTask; let task: URLSessionDataTask; var bytes = 0 }
    private var transfers: [Int: Transfer] = [:]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 45
        if !testProtocols.isEmpty { config.protocolClasses = testProtocols }
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        DispatchQueue.main.async {
            guard let encoded = urlSchemeTask.request.url,
                  encoded.host == "fetch",
                  let value = URLComponents(url: encoded, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "url" })?.value,
                  let remote = URL(string: value), HostPolicy.remote(remote) else {
                urlSchemeTask.didFailWithError(HostFailure.message("图片地址未获允许")); return
            }
            let task = self.session.dataTask(with: URLRequest(url: HostPolicy.transportURL(remote)))
            self.transfers[task.taskIdentifier] = Transfer(web: urlSchemeTask, task: task)
            task.resume()
        }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        DispatchQueue.main.async {
            if let id = self.transfers.first(where: { $0.value.web === urlSchemeTask })?.key {
                self.transfers.removeValue(forKey: id)?.task.cancel()
            }
        }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let transfer = transfers[dataTask.taskIdentifier], let response = response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode), response.expectedContentLength <= 32 * 1024 * 1024 else {
            completionHandler(.cancel); return
        }
        let local = URLResponse(url: transfer.web.request.url!, mimeType: response.mimeType, expectedContentLength: Int(response.expectedContentLength), textEncodingName: nil)
        transfer.web.didReceive(local); completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard var transfer = transfers[dataTask.taskIdentifier] else { return }
        transfer.bytes += data.count
        if transfer.bytes > 32 * 1024 * 1024 { transfer.task.cancel(); return }
        transfers[dataTask.taskIdentifier] = transfer
        transfer.web.didReceive(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let transfer = transfers.removeValue(forKey: task.taskIdentifier) else { return }
        if let error { transfer.web.didFailWithError(error) } else { transfer.web.didFinish() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard HostPolicy.remote(request.url) else { completionHandler(nil); return }
        var safe = request
        safe.url = request.url.map { HostPolicy.transportURL($0) }
        for header in ["Origin", "Referer", "Cookie", "Authorization"] { safe.setValue(nil, forHTTPHeaderField: header) }
        completionHandler(safe)
    }
}
