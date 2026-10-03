#if targetEnvironment(simulator)
import Foundation
import UIKit

/// UI test data is compiled out of every device IPA. No real login or official writes.
enum IOSSimulatorFixtures {
    static let script = #"""
    localStorage.clear();
    localStorage.setItem('ios-ui-fixture','true');
    localStorage.setItem('token','fixture.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.test');
    localStorage.setItem('userId','ios-simulator-fixture');
    localStorage.setItem('realName','模拟测试');
    localStorage.setItem('apiBaseUrl','http://sxz.api.zykj.org');
    location.hash='/column';
    const image='https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/__ios_image_fixture.png';
    const fixtureFetch=window.fetch;
    window.fetch=async(input,init)=>{
      const url=typeof input==='string'?input:input.url;
      if(!/^https?:/.test(url) || new URL(url).hostname==='127.0.0.1')return fixtureFetch(input,init);
      let result;
      if(url.includes('GetTopicSpecialAsync'))result=[{topicId:1,topicName:'语文',cols:[{id:1,name:'测试专栏',sort:0}]}];
      else if(url.includes('SearchMyPagesByColIdAsync'))result={totalCount:20,items:Array.from({length:20},(_,i)=>({id:i+1,title:'测试文章 '+(i+1),publishTime:'2026-10-03',stars:0,comments:0}))};
      else if(url.includes('GetSpecialCatalogAsync'))result=[];
      else if(url.includes('GetMyMessageListAsync'))result={totalCount:0,items:[]};
      else if(url.includes('GetPageAsync'))result={id:1,title:'测试文章 1',content:'<p>文章图片测试</p><img id="fixture-image" crossorigin="anonymous" src="'+image+'" alt="原生图片" style="width:120px;height:120px">',creatorUser:{fullName:'模拟测试'},lastModificationTime:'2026-10-03',stars:0,collects:0,comments:0};
      else if(url.includes('HitAsync'))result=true;
      else return new Response(JSON.stringify({success:false,error:{message:'测试模式禁止真实接口请求'}}),{status:503});
      return new Response(JSON.stringify({success:true,result}),{headers:{'Content-Type':'application/json'}});
    };
    const checkImage=setInterval(()=>{
      const img=document.getElementById('fixture-image');
      if(img && img.complete && img.naturalWidth>0){
        const label=document.createElement('p');label.textContent='图片原生加载通过';img.after(label);clearInterval(checkImage);
      }
    },200);
    """#
}
final class FixtureImageProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "ezy-sxz.oss-cn-hangzhou.aliyuncs.com" && request.url?.path == "/__ios_image_fixture.png"
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard request.value(forHTTPHeaderField: "Referer") == nil, request.value(forHTTPHeaderField: "Origin") == nil else {
            client?.urlProtocol(self, didFailWithError: HostFailure.message("图片不应发送 Referer/Origin")); return
        }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).pngData { ctx in
            UIColor.systemPurple.setFill(); ctx.cgContext.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type":"image/png"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: image); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
