package com.nikkitown.blocktown;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Keeps Capacitor navigation/bridge behavior and overlays verified local files. */
public final class OverlayWebViewClient extends BridgeWebViewClient {
    private final AndroidOverlayManager overlays;

    public OverlayWebViewClient(Bridge bridge, AndroidOverlayManager overlays) {
        super(bridge);
        this.overlays = overlays;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && "localhost".equalsIgnoreCase(uri.getHost())
            && (request.getMethod() == null || "GET".equalsIgnoreCase(request.getMethod()))) {
            WebResourceResponse replacement = overlays.open(uri.getPath());
            if (replacement != null) return replacement;
        }
        return super.shouldInterceptRequest(view, request);
    }
}
