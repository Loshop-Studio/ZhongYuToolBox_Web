package com.aoki.zhongyutoolbox;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** A local asset UI with origin-scoped messaging; remote school views get network access only. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int PICK_FILES = 1001, SAVE_FILE = 1002;
    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final Map<String, Stage> requests = new ConcurrentHashMap<>(), saves = new ConcurrentHashMap<>();
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private FrameLayout root;
    private WebView main, guest;
    private String guestId = "", guestError = "", bridge;
    private boolean guestLoaded, closing;
    private ValueCallback<Uri[]> fileCallback;
    private Stage pendingSave;
    private JavaScriptReplyProxy saveReply;
    private int saveCallId;
    private File cache;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        cache = new File(getCacheDir(), "bridge"); cache.mkdirs();
        File[] leftovers = cache.listFiles();
        if (leftovers != null) for (File file : leftovers) if (file.isFile()) file.delete();
        try { bridge = readAsset("android-bridge.js"); }
        catch (IOException error) { Toast.makeText(this,"应用资源不完整，请重新安装",Toast.LENGTH_LONG).show(); finish(); return; }
        root = new FrameLayout(this); setContentView(root);
        // Target 35 uses edge-to-edge: keep the web UI outside system bars and keyboard.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        main = createWebView(true, ORIGIN, ""); root.addView(main,new FrameLayout.LayoutParams(-1,-1));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        main.loadUrl(ORIGIN + "/assets/index.html");
    }
    private boolean systemDark() { return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES; }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (main != null) main.evaluateJavascript("window.__zytbSetSystemDark&&window.__zytbSetSystemDark("+systemDark()+")",null);
    }
    private String readAsset(String path) throws IOException {
        try(InputStream input=getAssets().open(path)){ return new String(readBytes(input),StandardCharsets.UTF_8); }
    }
    private static byte[] readBytes(InputStream input) throws IOException {
        ByteArrayOutputStream output=new ByteArrayOutputStream(); copy(input,output,4L*1024*1024); return output.toByteArray();
    }
    private static void copy(InputStream input,OutputStream output,long limit) throws IOException {
        byte[] buffer=new byte[64*1024]; long count=0; int n;
        while((n=input.read(buffer))!=-1){ count+=n; if(count>limit)throw new IOException("文件超过本次处理上限"); output.write(buffer,0,n); }
    }
    static boolean remoteAllowed(String value) {
        try {
            Uri uri=Uri.parse(value); String scheme=uri.getScheme(), host=uri.getHost();
            if(!("https".equals(scheme)||"http".equals(scheme))||host==null||uri.getUserInfo()!=null)return false;
            host=host.toLowerCase(Locale.ROOT);
            for(String suffix:new String[]{"zykj.org","zyai.cc","linspirer.com","aliyuncs.com"})
                if(host.equals(suffix)||host.endsWith("."+suffix))return uri.getPort()==-1||uri.getPort()==80||uri.getPort()==443||("linspirer.com".equals(suffix)&&uri.getPort()==883);
        }catch(Exception ignored){} return false;
    }
    private WebView createWebView(boolean privileged,String allowedOrigin,String bootstrap) {
        WebView view=new WebView(this); WebSettings settings=view.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString()+" ZhongYuToolBox/aoki-android");
        final WebViewAssetLoader loader=new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/native-response/",path -> cachedResponse(path)).build();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this,"请更新 Android System WebView 或 Chrome 后使用",Toast.LENGTH_LONG).show(); finish(); return view;
        }
        WebViewCompat.addWebMessageListener(view,"ZyAndroid",Collections.singleton(allowedOrigin),(web,message,origin,isMainFrame,reply) -> {
            if(!isMainFrame||!allowedOrigin.equals(origin.toString())||closing)return;
            try{
                JSONObject body=new JSONObject(message.getData()); int id=body.getInt("id");
                String method=body.getString("method"); JSONObject args=body.optJSONObject("args");
                if(args==null)args=new JSONObject();
                final JSONObject params=args;
                if(!privileged&&!Arrays.asList("beginRequest","writeRequest","request","cancelRequest").contains(method))throw new IllegalArgumentException("远程页面不能调用本机功能");
                if(method.equals("openEmbedded")||method.equals("resizeEmbedded")||method.equals("closeEmbedded")||method.equals("getEmbeddedState")||method.equals("setThemeDark")||method.equals("openExternal")||method.equals("finishSave")||method.equals("getEnvironment")) {
                    handleUi(method,params,id,reply); return;
                }
                io.execute(() -> {try{ reply(reply,id,handleIo(method,params,privileged),null); }catch(Exception error){reply(reply,id,null,error.getMessage());}});
            }catch(Exception error){ try {int id=new JSONObject(message.getData()).optInt("id");reply(reply,id,null,error.getMessage());}catch(Exception ignored){} }
        });
        String script=bridge+"\n"+bootstrap;
        if(!privileged&&WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            WebViewCompat.addDocumentStartJavaScript(view,script,Collections.singleton(allowedOrigin));
        view.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView web,WebResourceRequest request) {
                WebResourceResponse local=loader.shouldInterceptRequest(request.getUrl()); if(local!=null)return local;
                if(!request.getMethod().equals("GET")||!remoteAllowed(request.getUrl().toString()))return null;
                try {
                    HttpURLConnection connection=connect(request.getUrl().toString(),"GET",new JSONObject(request.getRequestHeaders()),null);
                    if(!privileged&&request.isForMainFrame()&& !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){
                        String html=new String(readBytes(connection.getInputStream()),StandardCharsets.UTF_8);
                        html=html.replaceFirst("(?i)<head[^>]*>","$0<script>"+java.util.regex.Matcher.quoteReplacement(script.replace("</script","<\\/script"))+"</script>");
                        connection.disconnect(); return response("text/html",200,new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    }
                    int status=connection.getResponseCode(); String mime=connection.getContentType();
                    if(mime==null)mime="application/octet-stream";
                    InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
                    if(stream==null)stream=new ByteArrayInputStream(new byte[0]);
                    final InputStream body=stream;
                    return response(mime.split(";")[0],status,new FilterInputStream(body){@Override public void close()throws IOException{try{super.close();}finally{connection.disconnect();}}});
                }catch(Exception error){return response("text/plain",502,new ByteArrayInputStream("网络请求失败，请检查网络或服务器证书".getBytes(StandardCharsets.UTF_8)));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView web,WebResourceRequest request) {
                String url=request.getUrl().toString();
                if(!request.isForMainFrame())return false;
                if(privileged&&url.startsWith(ORIGIN+"/assets/"))return false;
                if(!privileged&&remoteAllowed(url))return false;
                openExternal(url); return true;
            }
            @Override public void onPageStarted(WebView web,String url,android.graphics.Bitmap icon) { if(!privileged){guestLoaded=false;guestError="";} }
            @Override public void onPageFinished(WebView web,String url) { if(!privileged)guestLoaded=guestError.isEmpty(); }
            @Override public void onReceivedHttpError(WebView web,WebResourceRequest request,WebResourceResponse response){if(!privileged&&request.isForMainFrame())guestError="服务器返回 HTTP "+response.getStatusCode();}
            @Override public void onReceivedError(WebView web,WebResourceRequest request,WebResourceError error){if(!privileged&&request.isForMainFrame()){guestError="加载失败："+error.getDescription();guestLoaded=false;}}
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView web,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                ArrayList<String> types=new ArrayList<>();
                for(String accept:params.getAcceptTypes())for(String type:accept.split(","))if(!type.trim().isEmpty())types.add(mimeFor(type.trim()));
                intent.setType(types.size()==1?types.get(0):"*/*");
                if(types.size()>1)intent.putExtra(Intent.EXTRA_MIME_TYPES,types.toArray(new String[0]));
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{startActivityForResult(intent,PICK_FILES);}catch(Exception error){fileCallback.onReceiveValue(null);fileCallback=null;Toast.makeText(MainActivity.this,"没有可用的系统文件选择器",Toast.LENGTH_LONG).show();}return true;
            }
            @Override public boolean onCreateWindow(WebView web,boolean dialog,boolean gesture,android.os.Message result){
                WebView popup=new WebView(MainActivity.this);popup.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView ignored,String url){openExternal(url);popup.destroy();return true;}});
                ((WebView.WebViewTransport)result.obj).setWebView(popup);result.sendToTarget();return true;
            }
        });
        view.setDownloadListener((url,agent,disposition,mime,size)->openExternal(url)); return view;
    }
    private static String mimeFor(String type){
        switch(type.toLowerCase(Locale.ROOT)){case ".pdf":return "application/pdf";case ".png":return "image/png";case ".jpg":case ".jpeg":return "image/jpeg";case ".webp":return "image/webp";case ".zip":return "application/zip";default:return type.contains("/")?type:"*/*";}
    }
    private WebResourceResponse cachedResponse(String path){
        if(!path.matches("[0-9a-f-]{36}\\.bin"))return response("text/plain",404,new ByteArrayInputStream(new byte[0]));
        File file=new File(cache,path);
        try{return response("application/octet-stream",200,new FileInputStream(file){@Override public void close()throws IOException{super.close();file.delete();}});}catch(IOException error){return response("text/plain",404,new ByteArrayInputStream(new byte[0]));}
    }
    private static WebResourceResponse response(String mime,int status,InputStream body){
        Map<String,String> headers=new HashMap<>();headers.put("Access-Control-Allow-Origin","*");headers.put("Cache-Control","no-store");
        return new WebResourceResponse(mime,"UTF-8",status,status>=400?"Error":"OK",headers,body);
    }
    private HttpURLConnection connect(String url,String method,JSONObject headers,File body)throws Exception{
        return connect(url,method,headers,body,false);
    }
    private HttpURLConnection connect(String url,String method,JSONObject headers,File body,boolean privileged)throws Exception{
        String current=url;JSONObject currentHeaders=headers;
        for(int redirect=0;redirect<6;redirect++){
            boolean authorStats=privileged&&"POST".equals(method)&&"https://tbapi.loshop.com.cn/api/login".equals(current);
            if(!remoteAllowed(current)&&!authorStats&&!(privileged&&"GET".equals(method)&&Arrays.asList("https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases/latest","https://api.github.com/repos/Loshop-Studio/ZhongYuToolBox_Web/releases/latest").contains(current)))throw new IOException("请求地址未获允许");
            HttpURLConnection conn=(HttpURLConnection)new URL(current).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(30000);conn.setReadTimeout(120000);conn.setRequestMethod(method);
            Iterator<String> keys=currentHeaders.keys();
            while(keys.hasNext()){String key=keys.next();if(!Arrays.asList("host","origin","referer","connection","content-length","accept-encoding","cookie").contains(key.toLowerCase(Locale.ROOT)))conn.setRequestProperty(key,currentHeaders.getString(key));}
            conn.setRequestProperty("Accept-Encoding","identity");
            if(body!=null&&body.length()>0&&!method.equals("GET")&&!method.equals("HEAD")){conn.setDoOutput(true);conn.setFixedLengthStreamingMode(body.length());try(InputStream input=new FileInputStream(body);OutputStream output=conn.getOutputStream()){copy(input,output,128L*1024*1024);}}
            int status=conn.getResponseCode();
            if(status>=300&&status<400&&conn.getHeaderField("Location")!=null){
                String next=new URL(new URL(current),conn.getHeaderField("Location")).toString();conn.disconnect();
                if(!new URL(current).getAuthority().equals(new URL(next).getAuthority())){currentHeaders=new JSONObject(currentHeaders.toString());currentHeaders.remove("Authorization");currentHeaders.remove("authorization");}
                if(status==303||((status==301||status==302)&&method.equals("POST"))){method="GET";body=null;}current=next;continue;
            }return conn;
        }throw new IOException("服务器重定向次数过多");
    }
    private Object handleIo(String method,JSONObject args,boolean privileged)throws Exception{
        String session=args.optString("session");Stage stage;
        switch(method){
            case "getDeviceId": return Settings.Secure.getString(getContentResolver(),Settings.Secure.ANDROID_ID);
            case "beginRequest": return createStage(requests,"request").id;
            case "writeRequest": stage=require(requests,session);stage.write(args);return true;
            case "cancelRequest": cancelled.add(session);HttpURLConnection conn=connections.remove(session);if(conn!=null)conn.disconnect();stage=requests.remove(session);if(stage!=null)stage.close();return true;
            case "request": return network(args,privileged);
            case "beginSave": return createStage(saves,args.optString("filename","下载文件.bin")).id;
            case "writeSaveChunk":stage=require(saves,session);stage.write(args);return true;
            case "abortSave":stage=saves.remove(session);if(stage!=null)stage.close();return true;
            default: throw new IllegalArgumentException("未知本机操作");
        }
    }
    private Object network(JSONObject args,boolean privileged)throws Exception{
        String id=args.getString("session");Stage stage=require(requests,id);File responseFile=new File(cache,UUID.randomUUID()+".bin");
        HttpURLConnection conn=null;
        try{
            if(cancelled.contains(id))throw new IOException("请求已取消");
            String method=args.optString("method","GET").toUpperCase(Locale.ROOT);
            if(!Arrays.asList("GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS").contains(method))throw new IOException("不支持的请求方法");
            conn=connect(args.getString("url"),method,args.optJSONObject("headers"),stage.file,privileged);connections.put(id,conn);
            if(cancelled.contains(id))throw new IOException("请求已取消");
            int status=conn.getResponseCode();JSONObject headers=new JSONObject();
            for(Map.Entry<String,List<String>> item:conn.getHeaderFields().entrySet())if(item.getKey()!=null&&!Arrays.asList("content-encoding","transfer-encoding","set-cookie").contains(item.getKey().toLowerCase(Locale.ROOT)))headers.put(item.getKey(),String.join(", ",item.getValue()));
            InputStream input=status>=400?conn.getErrorStream():conn.getInputStream();
            if(input!=null)try(InputStream data=input;OutputStream output=new FileOutputStream(responseFile)){copy(data,output,256L*1024*1024);}else new FileOutputStream(responseFile).close();
            return new JSONObject().put("status",status).put("statusText",conn.getResponseMessage()==null?"":conn.getResponseMessage()).put("headers",headers).put("bodyUrl",ORIGIN+"/native-response/"+responseFile.getName());
        }catch(Exception error){responseFile.delete();throw error;}
        finally{connections.remove(id);cancelled.remove(id);if(conn!=null)conn.disconnect();requests.remove(id);stage.close();}
    }
    private Stage createStage(Map<String,Stage> map,String name)throws IOException{if(map.size()>12)throw new IOException("待处理文件过多，请稍后重试");Stage stage=new Stage(cache,name);map.put(stage.id,stage);return stage;}
    private static Stage require(Map<String,Stage> map,String id)throws IOException{Stage stage=map.get(id);if(stage==null)throw new IOException("文件会话已失效，请重试");return stage;}
    private void handleUi(String method,JSONObject args,int id,JavaScriptReplyProxy reply)throws Exception{
        Object result=true;
        switch(method){
            case "getEnvironment":result=new JSONObject().put("systemDark",systemDark());break;
            case "setThemeDark":boolean dark=args.optBoolean("dark");int colour=Color.parseColor(dark?"#1C191F":"#F0EEE9");root.setBackgroundColor(colour);main.setBackgroundColor(colour);getWindow().setStatusBarColor(colour);getWindow().setNavigationBarColor(colour);getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);break;
            case "openExternal":openExternal(args.optString("url"));break;
            case "openEmbedded":
                String url=args.getString("url");if(!remoteAllowed(url))throw new IOException("不支持的内嵌页面地址");
                closeGuest();guestId=args.getString("id");guestLoaded=false;guestError="";
                Uri parsed=Uri.parse(url);String origin=parsed.getScheme()+"://"+parsed.getAuthority();
                guest=createWebView(false,origin,args.optString("script"));root.addView(guest);resizeGuest(args);guest.loadUrl(url);break;
            case "resizeEmbedded":if(guest!=null&&guestId.equals(args.optString("id")))resizeGuest(args);break;
            case "closeEmbedded":if(guestId.equals(args.optString("id")))closeGuest();break;
            case "getEmbeddedState":result=new JSONObject().put("loaded",guestId.equals(args.optString("id"))&&guestLoaded).put("error",guestId.equals(args.optString("id"))?guestError:"");break;
            case "finishSave":
                if(pendingSave!=null)throw new IOException("请先完成当前保存操作");
                Stage stage=require(saves,args.getString("session"));if(stage.file.length()!=args.getLong("size"))throw new IOException("保存文件长度不一致");
                pendingSave=stage;saveReply=reply;saveCallId=id;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mimeFor("."+stage.name.substring(stage.name.lastIndexOf('.')+1))).putExtra(Intent.EXTRA_TITLE,stage.name);
                try{startActivityForResult(intent,SAVE_FILE);}catch(Exception error){pendingSave=null;saveReply=null;throw error;}return;
        }reply(reply,id,result,null);
    }
    private void resizeGuest(JSONObject args){
        float density=getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(Math.max(1,(int)(args.optDouble("width",1)*density)),Math.max(1,(int)(args.optDouble("height",1)*density)));
        params.leftMargin=(int)(args.optDouble("x")*density);params.topMargin=(int)(args.optDouble("y")*density);guest.setLayoutParams(params);
    }
    private void closeGuest(){if(guest!=null){root.removeView(guest);guest.stopLoading();guest.destroy();guest=null;}guestId="";guestLoaded=false;}
    private void openExternal(String value){try{Uri uri=Uri.parse(value);if(!Arrays.asList("http","https").contains(uri.getScheme())||ORIGIN.equals(uri.getScheme()+"://"+uri.getAuthority()))return;startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){Toast.makeText(this,"没有可打开此链接的应用",Toast.LENGTH_SHORT).show();}}
    private void reply(JavaScriptReplyProxy proxy,int id,Object value,String error){runOnUiThread(()->{if(closing)return;try{JSONObject result=new JSONObject().put("id",id);if(error!=null)result.put("error",error);else result.put("result",value==null?JSONObject.NULL:value);proxy.postMessage(result.toString());}catch(Exception ignored){}});}
    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);
        if(code==PICK_FILES&&fileCallback!=null){ArrayList<Uri> uris=new ArrayList<>();if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null)for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());else if(data.getData()!=null)uris.add(data.getData());}fileCallback.onReceiveValue(uris.isEmpty()?null:uris.toArray(new Uri[0]));fileCallback=null;}
        if(code==SAVE_FILE&&pendingSave!=null){final Stage stage=pendingSave;final JavaScriptReplyProxy proxy=saveReply;final int id=saveCallId;pendingSave=null;saveReply=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){stage.close();saves.remove(stage.id);try{reply(proxy,id,new JSONObject().put("canceled",true),null);}catch(Exception ignored){}return;}
            final Uri uri=data.getData();io.execute(()->{try(InputStream input=new FileInputStream(stage.file);OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output==null)throw new IOException("无法写入选择的位置");copy(input,output,128L*1024*1024);reply(proxy,id,new JSONObject().put("canceled",false),null);}catch(Exception error){reply(proxy,id,null,error.getMessage());}finally{saves.remove(stage.id);stage.close();}});
        }
    }
    @Override public void onBackPressed(){if(guest!=null&&guest.canGoBack()){guest.goBack();return;}main.evaluateJavascript("window.__zytbBack?window.__zytbBack():false",result->{if(!"true".equals(result))finish();});}
    @Override protected void onDestroy(){closing=true;closeGuest();if(fileCallback!=null)fileCallback.onReceiveValue(null);for(HttpURLConnection conn:connections.values())conn.disconnect();io.shutdownNow();for(Stage stage:requests.values())stage.close();for(Stage stage:saves.values())stage.close();if(main!=null)main.destroy();super.onDestroy();}
    private static final class Stage {
        final String id=UUID.randomUUID().toString(),name;final File file;
        Stage(File cache,String name)throws IOException{this.name=name.replaceAll("[\\\\/:*?\"<>|\\r\\n]","_");file=new File(cache,id+".part");new FileOutputStream(file).close();}
        synchronized void write(JSONObject args)throws Exception{if(args.getLong("offset")!=file.length())throw new IOException("文件块顺序不一致");byte[] bytes=Base64.decode(args.getString("base64"),Base64.DEFAULT);if(bytes.length>192*1024||file.length()+bytes.length>128L*1024*1024)throw new IOException("文件超过 128 MB，请拆分后重试");try(OutputStream output=new FileOutputStream(file,true)){output.write(bytes);}}
        synchronized void close(){file.delete();}
    }
}
