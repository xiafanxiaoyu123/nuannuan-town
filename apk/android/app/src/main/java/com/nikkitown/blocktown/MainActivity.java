package com.nikkitown.blocktown;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.WindowManager;
import android.view.Display;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.net.Uri;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
    private static final String ANDROID_UPDATE_MANIFEST_URL = "";
    private AndroidOverlayManager overlays;
    // Kept as an explicit, opt-in service. No update is started during launch.
    private AndroidOverlayDownloader overlayDownloader;
    private final AtomicBoolean updateBusy = new AtomicBoolean(false);
    private volatile String updatePhase = "idle";
    private volatile String updateAvailableVersion = "";
    private volatile String updateReleaseNotes = "";
    private volatile String updateError = "";
    private volatile String orientationMode = "auto";
    private int orientationRequestSerial = 0;
    private volatile int requestedFrameRate = 0;
    private volatile float preferredFrameRate = 0;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Hardware volume buttons control game/media audio, without changing
        // the user's volume, silent mode, or selected audio output device.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        // 自建登录 API 位于独立 HTTPS 域名，而 Capacitor 页面位于
        // https://localhost。允许该 HTTPS API 的 SameSite=None 会话 Cookie
        // 在 WebView 的凭据请求中往返；服务端仍通过精确 CORS 白名单限制来源。
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 刘海 / 挖孔屏：画面铺满整个屏幕，不留白边
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        enterImmersive();
        // Keep Capacitor's bridge client and serve only verified local overlay files first.
        // The release build may override these resources with its pinned
        // X.509 P-256 public key and key id. Empty values intentionally keep
        // network overlays disabled until a release key is configured.
        String updatePublicKey = getString(com.nikkitown.blocktown.R.string.android_overlay_update_public_key);
        String updateKeyId = getString(com.nikkitown.blocktown.R.string.android_overlay_update_key_id);
        overlays = new AndroidOverlayManager(getApplicationContext(), updatePublicKey, updateKeyId);
        overlayDownloader = new AndroidOverlayDownloader(getApplicationContext(), overlays);
        getBridge().setWebViewClient(new OverlayWebViewClient(getBridge(), overlays));
    }

    @Override
    protected void load() {
        // BridgeActivity calls load() after inflating the WebView. Bridge's
        // constructor calls loadUrl(), so registering after super.onCreate()
        // misses the first document on WebViews that snapshot interfaces at
        // navigation start. Register before super.load(), with no reload.
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        webView.addJavascriptInterface(createNativeInterface(), "NikkiNative");
        orientationMode = normalizeOrientation(getPreferences(MODE_PRIVATE).getString("screenOrientation", "auto"));
        if (orientationMode == null) orientationMode = "auto";
        setRequestedOrientation(orientationValue(orientationMode));
        super.load();
    }

    private Object createNativeInterface() {
        return new Object() {
            @JavascriptInterface
            public void setOrientation(final String mode) {
                requestOrientation(mode, "");
            }
            @JavascriptInterface
            public void setOrientationRequest(final String mode, final String requestId) {
                requestOrientation(mode, requestId);
            }
            @JavascriptInterface
            public String getOrientation() { return orientationMode; }
            // 把拍下的照片直接存进系统相册（图库里的「暖暖的方块小镇」）
            @JavascriptInterface
            public boolean savePhoto(final String base64, final String name) {
                try {
                    if (Build.VERSION.SDK_INT < 29) return false; // 老系统交给网页自己的下载方式
                    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    android.content.ContentValues v = new android.content.ContentValues();
                    v.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name);
                    v.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    v.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/暖暖的方块小镇");
                    android.net.Uri uri = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return false;
                    try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(data); }
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
            // 把网页导出的 TXT 存到系统「下载」目录。WebView 不会自动处理 Blob URL 下载，
            // 因此由原生端接收完整 UTF-8 文本并通过 MediaStore 写入公共下载目录。
            // Android 9 及以下没有无需额外权限的公共 Downloads MediaStore 写入路径；
            // 返回 false 让网页展开全文并走剪贴板/手动复制回退，避免写入应用私有目录后误报成功。
            @JavascriptInterface
            public boolean saveText(final String name, final String text) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || text == null || text.isEmpty()) return false;
                String safeName = name == null ? "暖暖小镇-存档.txt" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (safeName.isEmpty()) safeName = "暖暖小镇-存档.txt";
                Uri uri = null;
                try {
                    // Keep API 29-only Downloads symbols out of the method's bytecode references;
                    // this APK still supports API 24 and older WebViews must load the activity.
                    final String displayName = "_display_name";
                    final String mimeType = "mime_type";
                    final String relativePath = "relative_path";
                    final String isPending = "is_pending";
                    ContentValues v = new ContentValues();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        v.put(displayName, safeName);
                        v.put(mimeType, "text/plain");
                        v.put(relativePath, Environment.DIRECTORY_DOWNLOADS);
                        v.put(isPending, 1);
                        uri = getContentResolver().insert(Uri.parse("content://media/external/downloads"), v);
                        if (uri == null) return false;
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os == null) throw new java.io.IOException("cannot open download");
                            os.write(text.getBytes(StandardCharsets.UTF_8));
                        }
                        v.clear();
                        v.put(isPending, 0);
                        if (getContentResolver().update(uri, v, null, null) != 1) {
                            throw new java.io.IOException("cannot finalize download");
                        }
                    } else {
                        java.io.File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        if (dir == null) return false;
                        if (!dir.exists() && !dir.mkdirs()) return false;
                        java.io.File file = new java.io.File(dir, safeName);
                        try (java.io.FileOutputStream os = new java.io.FileOutputStream(file)) {
                            os.write(text.getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    return true;
                } catch (Exception e) {
                    if (uri != null) try { getContentResolver().delete(uri, null, null); } catch (Exception ignored) { }
                    return false;
                }
            }
            @JavascriptInterface
            public boolean copyText(final String text) {
                if (text == null || text.isEmpty()) return false;
                try {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (clipboard == null) return false;
                    clipboard.setPrimaryClip(ClipData.newPlainText("暖暖小镇存档", text));
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            /** Returns a small JSON snapshot for the mobile resource-update UI. */
            @JavascriptInterface
            public String getAndroidUpdateState() { return updateStateJson(); }

            /** A preference only: Android and power/thermal policy keep final control. */
            @JavascriptInterface
            public void setFrameRatePreference(int fps) {
                if (fps != 0 && fps != 30 && fps != 60 && fps != 90 && fps != 120) return;
                requestedFrameRate = fps;
                runOnUiThread(() -> applyFrameRatePreference());
            }

            @JavascriptInterface
            public String getDisplayFrameRateInfo() { return displayFrameRateInfo(); }

            /** Checks the pinned HTTPS manifest without downloading update files. */
            @JavascriptInterface
            public void checkAndroidUpdate() { startAndroidUpdateCheck(); }

            /** Downloads and verifies an available resource update into staging. */
            @JavascriptInterface
            public void downloadAndroidUpdate() { startAndroidUpdateDownload(); }

            /** Atomically activates the staged resources and reloads the WebView. */
            @JavascriptInterface
            public void applyAndroidUpdate() { startAndroidUpdateApply(); }

            /** Restores the previous verified resource version without touching saves. */
            @JavascriptInterface
            public boolean rollbackAndroidUpdate() {
                if (overlays == null || !updateBusy.compareAndSet(false, true)) return false;
                try {
                    if (!overlays.hasActiveOverlay() || !overlays.rollback()) return false;
                    updateAvailableVersion = "";
                    updateReleaseNotes = "";
                    updateError = "";
                    updatePhase = "idle";
                    runOnUiThread(() -> {
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            getBridge().getWebView().clearCache(false);
                            getBridge().getWebView().reload();
                        }
                    });
                    return true;
                } finally { updateBusy.set(false); emitUpdateState(updatePhase); }
            }
        };
    }

    private static String normalizeOrientation(String mode) {
        if ("port".equals(mode) || "portrait".equals(mode)) return "port";
        if ("land".equals(mode) || "landscape".equals(mode)) return "land";
        if (mode == null || mode.isEmpty() || "auto".equals(mode) || "follow".equals(mode)) return "auto";
        return null;
    }

    private static int orientationValue(String mode) {
        // Fixed choices must not continue responding to the rotation sensor.
        return "port".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            : "land".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR;
    }

    private void requestOrientation(String input, String requestId) {
        final String mode = normalizeOrientation(input);
        runOnUiThread(() -> {
            if (mode == null || (!"auto".equals(mode) && isInMultiWindowMode())) {
                emitOrientationResult(requestId, mode, false);
                return;
            }
            final int serial = ++orientationRequestSerial;
            final int previous = getRequestedOrientation();
            try {
                setRequestedOrientation(orientationValue(mode));
                verifyOrientation(serial, mode, requestId, previous, 20);
            } catch (RuntimeException error) { emitOrientationResult(requestId, mode, false); }
        });
    }

    private void verifyOrientation(int serial, String mode, String requestId, int previous, int attempts) {
        if (serial != orientationRequestSerial) { emitOrientationResult(requestId, mode, false); return; }
        int current = getResources().getConfiguration().orientation;
        boolean applied = "auto".equals(mode)
            || ("port".equals(mode) && current == Configuration.ORIENTATION_PORTRAIT)
            || ("land".equals(mode) && current == Configuration.ORIENTATION_LANDSCAPE);
        if (applied) {
            orientationMode = mode;
            getPreferences(MODE_PRIVATE).edit().putString("screenOrientation", mode).apply();
            emitOrientationResult(requestId, mode, true);
        } else if (attempts > 0) {
            getBridge().getWebView().postDelayed(() -> verifyOrientation(serial, mode, requestId, previous, attempts - 1), 100);
        } else {
            // System/OEM restrictions can reject fixed orientation. Keep the
            // last working preference instead of showing a false success.
            setRequestedOrientation(previous);
            emitOrientationResult(requestId, mode, false);
        }
    }

    private void emitOrientationResult(String requestId, String mode, boolean ok) {
        if (requestId == null || requestId.isEmpty() || getBridge() == null) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("id", requestId);
            detail.put("mode", mode);
            detail.put("ok", ok);
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nuannuan:orientation',{detail:" + detail + "}))", null);
        } catch (Exception ignored) { }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyFrameRatePreference();
        if (getBridge() != null) getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('nuannuan:app-resume'))", null);
    }

    private void applyFrameRatePreference() {
        Display display = getWindowManager().getDefaultDisplay();
        if (display == null) return;
        float target = requestedFrameRate;
        if (target > 0 && Build.VERSION.SDK_INT < 34) {
            // Before Android 14 this field must name a supported refresh rate.
            float above = Float.MAX_VALUE, highest = 0;
            Display.Mode current = display.getMode();
            for (Display.Mode mode : display.getSupportedModes()) {
                if (mode.getPhysicalWidth() != current.getPhysicalWidth()
                    || mode.getPhysicalHeight() != current.getPhysicalHeight()) continue;
                float rate = mode.getRefreshRate();
                highest = Math.max(highest, rate);
                if (rate + .5f >= target) above = Math.min(above, rate);
            }
            target = above < Float.MAX_VALUE ? above : highest;
        }
        WindowManager.LayoutParams attrs = getWindow().getAttributes();
        attrs.preferredDisplayModeId = 0;
        attrs.preferredRefreshRate = target;
        getWindow().setAttributes(attrs);
        preferredFrameRate = target;
    }

    private String displayFrameRateInfo() {
        try {
            Display display = getWindowManager().getDefaultDisplay();
            JSONObject info = new JSONObject();
            info.put("requestedFps", requestedFrameRate);
            info.put("preferredRefreshRate", preferredFrameRate);
            if (display != null) {
                info.put("displayRefreshRate", display.getRefreshRate());
                JSONArray rates = new JSONArray();
                Display.Mode current = display.getMode();
                for (Display.Mode mode : display.getSupportedModes()) {
                    if (mode.getPhysicalWidth() == current.getPhysicalWidth()
                        && mode.getPhysicalHeight() == current.getPhysicalHeight()) rates.put(mode.getRefreshRate());
                }
                info.put("supportedRefreshRates", rates);
            }
            return info.toString();
        } catch (Exception ignored) { return "{}"; }
    }

    private String updateStateJson() {
        try {
            JSONObject result = new JSONObject();
            result.put("phase", updatePhase);
            result.put("currentVersion", overlays == null ? packageVersion() : overlays.getCurrentVersion());
            result.put("installedApkVersion", packageVersion());
            result.put("updateProtocolVersion", 2);
            result.put("stagedVersion", overlays == null ? "" : overlays.getStagedVersion());
            result.put("availableVersion", updateAvailableVersion);
            result.put("releaseNotes", updateReleaseNotes);
            result.put("error", updateError);
            result.put("configured", !ANDROID_UPDATE_MANIFEST_URL.isEmpty());
            result.put("canCheck", !ANDROID_UPDATE_MANIFEST_URL.isEmpty() && !updateBusy.get());
            result.put("canRollback", overlays != null && overlays.hasActiveOverlay() && !updateBusy.get());
            return result.toString();
        } catch (Exception ignored) { return "{\"phase\":\"idle\"}"; }
    }

    private void emitUpdateState(String phase) {
        updatePhase = phase;
        String detail = updateStateJson();
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('nuannuan:android-update',{detail:" + detail + "}))", null));
    }

    private void startAndroidUpdateCheck() {
        if (ANDROID_UPDATE_MANIFEST_URL.isEmpty()) { emitUpdateState("disabled"); return; }
        if (overlayDownloader == null || !updateBusy.compareAndSet(false, true)) return;
        updateError = "";
        if (!overlays.getStagedVersion().isEmpty()) {
            updateBusy.set(false);
            updatePhase = "staged";
            emitUpdateState("staged");
            return;
        }
        emitUpdateState("checking");
        new Thread(() -> {
            try {
                JSONObject manifest = overlayDownloader.checkLatest(new URL(ANDROID_UPDATE_MANIFEST_URL));
                if (manifest == null) {
                    updateError = overlayDownloader.getLastError();
                    emitUpdateState("error");
                    return;
                }
                String version = manifest.optString("version", "");
                if (compareVersions(version, overlays.getCurrentVersion()) <= 0) {
                    updateAvailableVersion = "";
                    updateReleaseNotes = "";
                    emitUpdateState("idle");
                } else {
                    updateAvailableVersion = version;
                    updateReleaseNotes = manifest.optString("releaseNotes", "");
                    emitUpdateState("available");
                }
            } catch (Exception error) {
                updateError = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                emitUpdateState("error");
            } finally { updateBusy.set(false); emitUpdateState(updatePhase); }
        }, "android-update-check").start();
    }

    private void startAndroidUpdateDownload() {
        if (ANDROID_UPDATE_MANIFEST_URL.isEmpty()) { emitUpdateState("disabled"); return; }
        if (overlayDownloader == null || !updateBusy.compareAndSet(false, true)) return;
        updateError = "";
        emitUpdateState("downloading");
        new Thread(() -> {
            try {
                boolean ok = overlayDownloader.updateLatest(new URL(ANDROID_UPDATE_MANIFEST_URL));
                if (!ok) {
                    updateError = overlayDownloader.getLastError();
                    emitUpdateState("error");
                } else {
                    updateAvailableVersion = overlays.getStagedVersion();
                    emitUpdateState("staged");
                }
            } catch (Exception error) {
                updateError = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                emitUpdateState("error");
            } finally { updateBusy.set(false); emitUpdateState(updatePhase); }
        }, "android-update-download").start();
    }

    private void startAndroidUpdateApply() {
        if (overlays == null || !updateBusy.compareAndSet(false, true)) return;
        emitUpdateState("applying");
        new Thread(() -> {
            boolean ok = overlays.activateStaged();
            updateBusy.set(false);
            if (!ok) {
                updateError = overlays.getLastError();
                if (updateError == null || updateError.isEmpty()) updateError = "没有可应用的已验证更新";
                emitUpdateState("error");
                return;
            }
            emitUpdateState("applying");
            runOnUiThread(() -> getBridge().getWebView().postDelayed(() -> getBridge().getWebView().reload(), 350));
        }, "android-update-apply").start();
    }

    private static int compareVersions(String left, String right) {
        String[] a = String.valueOf(left).split("[._-]");
        String[] b = String.valueOf(right).split("[._-]");
        int length = Math.max(a.length, b.length);
        for (int i = 0; i < length; i++) {
            int av = i < a.length ? parseVersionPart(a[i]) : 0;
            int bv = i < b.length ? parseVersionPart(b[i]) : 0;
            if (av != bv) return Integer.compare(av, bv);
        }
        return 0;
    }

    private String packageVersion() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.isEmpty() ? "0.0.0" : value;
        } catch (Exception ignored) { return "0.0.0"; }
    }

    private static int parseVersionPart(String value) {
        try { return Integer.parseInt(value.replaceAll("[^0-9].*", "")); }
        catch (Exception ignored) { return 0; }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    // 隐藏状态栏与导航栏，边缘滑动时临时呼出
    private void enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
